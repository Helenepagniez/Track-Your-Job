import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
    Application,
    ApplicationEvent,
    ApplicationStatus,
    Campaign,
    CampaignOutcome,
    Company,
    Contact,
    FavoriteOffer,
    INTERVIEW_LABELS,
    InterviewKind,
    JobPosting,
    Profile,
    companyKey,
    computeCampaignStats,
    currentStatus,
    enteredStatusAt,
    interviewEvents,
    sentAt
} from '../models/job-search.models';
import { UserData } from './storage/app-data';
import { AuthService } from './auth.service';
import { TasksService } from './tasks.service';
import { UserDataService } from './user-data.service';

/** Délai avant de proposer une relance, puis de classer sans réponse. */
export const RELAUNCH_AFTER_DAYS = 14;
export const NO_RESPONSE_AFTER_DAYS = 35;

/**
 * Ce qu'un formulaire de candidature renvoie. Le store se charge de traduire
 * cela en entités et en événements datés ; aucun écran n'écrit d'événement.
 */
export interface ApplicationDraft {
    title: string;
    /** Vide = employeur non communiqué. */
    companyName: string;
    agencyName?: string;
    location?: string;
    contractType?: string;
    contractDuration?: string;
    weeklyHours?: string;
    salary?: string;
    source?: string;
    link?: string;
    posting?: JobPosting;
    status: ApplicationStatus;
    /** Date ISO d'un entretien à enregistrer avec la candidature. */
    interviewAt?: string;
    interviewKind?: InterviewKind;
}

export interface NewApplication {
    title: string;
    companyId?: number | null;
    companyName?: string;
    agencyName?: string;
    location?: string;
    contractType?: string;
    contractDuration?: string;
    weeklyHours?: string;
    salary?: string;
    source?: string;
    link?: string;
    posting?: JobPosting;
    status?: ApplicationStatus;
    createdAt?: string;
    contactIds?: number[];
}

/**
 * Source de vérité de la recherche d'emploi. Les écrans lisent ses signaux et
 * appellent ses méthodes ; personne n'écrit dans le localStorage directement.
 */
@Injectable({ providedIn: 'root' })
export class JobSearchStore {
    private userData = inject(UserDataService);
    private auth = inject(AuthService);
    private tasksService = inject(TasksService);

    /** Les données viennent du document Firestore, pas d'un cache local. */
    private data = computed<UserData | null>(() => this.userData.data());

    /** Faux tant que Firestore n'a pas répondu pour ce compte. */
    ready = computed(() => this.userData.ready());
    syncError = computed(() => this.userData.error());

    profile = computed<Profile | null>(() => this.data()?.profile ?? null);
    campaigns = computed<Campaign[]>(() => this.data()?.campaigns ?? []);
    companies = computed<Company[]>(() => this.data()?.companies ?? []);
    contacts = computed<Contact[]>(() => this.data()?.contacts ?? []);
    applications = computed<Application[]>(() => this.data()?.applications ?? []);

    activeCampaign = computed<Campaign | null>(
        () => this.campaigns().find(campaign => campaign.status === 'active') ?? null
    );

    /** Candidatures de la campagne en cours. */
    currentApplications = computed<Application[]>(() => {
        const campaign = this.activeCampaign();
        if (!campaign) return this.applications();
        return this.applications().filter(app => app.campaignId === campaign.id);
    });

    constructor() {
        // Dès que les données du compte sont là, on fait avancer les
        // candidatures restées sans nouvelle.
        effect(() => {
            const loaded = this.userData.ready() && !!this.data();
            if (loaded) {
                untracked(() => this.runRelaunchAutomation());
            }
        }, { allowSignalWrites: true });
    }

    // ------------------------------------------------------------- lectures

    company(id: number | null | undefined): Company | undefined {
        if (id === null || id === undefined) return undefined;
        return this.companies().find(entry => entry.id === id);
    }

    companyByName(name: string): Company | undefined {
        const key = companyKey(name);
        return this.companies().find(entry => companyKey(entry.name) === key);
    }

    application(id: number): Application | undefined {
        return this.applications().find(app => app.id === id);
    }

    contact(id: number): Contact | undefined {
        return this.contacts().find(entry => entry.id === id);
    }

    /** Contacts rattachés à une entreprise, poste actuel ou ancien. */
    contactsOfCompany(companyId: number): Contact[] {
        return this.contacts().filter(contact =>
            contact.affiliations.some(affiliation => affiliation.companyId === companyId)
        );
    }

    applicationsOfCompany(companyId: number): Application[] {
        return this.applications().filter(app => app.companyId === companyId);
    }

    // ------------------------------------------------------------- écritures

    /**
     * Toute écriture passe par le service qui détient le document : il part
     * toujours de la dernière version connue, et `TasksService` emprunte le
     * même chemin. Deux écrivains ne peuvent donc plus s'écraser.
     */
    private commit(mutate: (data: UserData) => void): void {
        this.userData.update(current => {
            const next: UserData = {
                ...current,
                campaigns: [...current.campaigns],
                companies: [...current.companies],
                contacts: [...current.contacts],
                applications: [...current.applications],
                tasks: [...current.tasks],
                favorites: [...(current.favorites ?? [])]
            };
            mutate(next);
            return next;
        });
    }

    private takeId(data: UserData): number {
        const id = data.nextId;
        data.nextId = id + 1;
        return id;
    }

    // ------------------------------------------------------------- profil

    /**
     * Écrit le profil. Les champs partagés avec l'identité (nom, email, poste,
     * lieu, compétences) sont relus par `AuthService` juste après, pour que
     * l'en-tête et les écrans affichent la même chose.
     */
    updateProfile(patch: Partial<Profile>): void {
        this.commit(data => {
            data.profile = { ...data.profile, ...patch, id: data.profile.id };
        });
        if (patch.fullName) {
            void this.auth.updateDisplayName(patch.fullName);
        }
    }

    // ------------------------------------------------------------ favoris

    /** Les offres mises de côté, la plus récente d'abord. */
    favorites = computed<FavoriteOffer[]>(() =>
        [...(this.data()?.favorites ?? [])]
            .sort((a, b) => b.savedAt.localeCompare(a.savedAt))
    );

    isFavorite(sourceId: string): boolean {
        return this.favorites().some(entry => entry.sourceId === sourceId);
    }

    /** Met une offre de côté. Deux fois la même ne fait qu'une. */
    addFavorite(offer: Omit<FavoriteOffer, 'savedAt'>): void {
        if (this.isFavorite(offer.sourceId)) return;

        this.commit(data => {
            data.favorites = [
                ...data.favorites,
                { ...offer, savedAt: new Date().toISOString() }
            ];
        });
    }

    removeFavorite(sourceId: string): void {
        this.commit(data => {
            data.favorites = data.favorites.filter(entry => entry.sourceId !== sourceId);
        });
    }

    /** Relie un favori à la candidature qui en est née. */
    linkFavorite(sourceId: string, applicationId: number): void {
        this.commit(data => {
            data.favorites = data.favorites.map(entry =>
                entry.sourceId === sourceId ? { ...entry, applicationId } : entry
            );
        });
    }

    /** Objectif hebdomadaire : porté par la campagne, pas par le profil. */
    setWeeklyGoal(goal: number | undefined): void {
        const campaign = this.activeCampaign();
        if (!campaign) return;
        this.commit(data => {
            data.campaigns = data.campaigns.map(entry =>
                entry.id === campaign.id ? { ...entry, weeklyGoal: goal } : entry
            );
        });
    }

    // -------------------------------------------------------- entreprises

    /** Trouve l'entreprise par son nom ou la crée. Retourne son identifiant. */
    ensureCompany(name: string, patch: Partial<Company> = {}): number | null {
        const trimmed = (name || '').trim();
        if (!trimmed) return null;

        const existing = this.companyByName(trimmed);
        if (existing) {
            const hasPatch = Object.keys(patch).length > 0;
            if (hasPatch) this.updateCompany(existing.id, patch);
            return existing.id;
        }

        let createdId: number | null = null;
        this.commit(data => {
            createdId = this.takeId(data);
            data.companies.push({
                id: createdId,
                name: trimmed,
                createdAt: new Date().toISOString(),
                history: [],
                ...patch
            });
        });
        return createdId;
    }

    updateCompany(id: number, patch: Partial<Company>): void {
        this.commit(data => {
            data.companies = data.companies.map(company =>
                company.id === id ? { ...company, ...patch, id: company.id } : company
            );
        });
    }

    /** Supprime la fiche ; les candidatures restent, sans employeur nommé. */
    deleteCompany(id: number): void {
        this.commit(data => {
            data.companies = data.companies.filter(company => company.id !== id);
            data.applications = data.applications.map(app =>
                app.companyId === id ? { ...app, companyId: null } : app
            );
            data.contacts = data.contacts.map(contact => ({
                ...contact,
                affiliations: contact.affiliations.filter(a => a.companyId !== id)
            }));
        });
    }

    // ------------------------------------------------------------ contacts

    addContact(contact: Omit<Contact, 'id' | 'createdAt'> & { createdAt?: string }): number {
        let createdId = 0;
        this.commit(data => {
            createdId = this.takeId(data);
            data.contacts.push({
                ...contact,
                id: createdId,
                createdAt: contact.createdAt ?? new Date().toISOString(),
                affiliations: contact.affiliations ?? []
            });
        });
        return createdId;
    }

    updateContact(id: number, patch: Partial<Contact>): void {
        this.commit(data => {
            data.contacts = data.contacts.map(contact =>
                contact.id === id ? { ...contact, ...patch, id: contact.id } : contact
            );
        });
    }

    /**
     * Rattache un contact à une entreprise. Un seul rattachement est « actuel »
     * à la fois : les précédents deviennent d'anciens postes, on ne les perd pas.
     */
    attachContactToCompany(contactId: number, companyId: number, role?: string, current = true): void {
        const contact = this.contact(contactId);
        if (!contact) return;

        const others = contact.affiliations
            .filter(affiliation => affiliation.companyId !== companyId)
            .map(affiliation => (current ? { ...affiliation, current: false } : affiliation));

        this.updateContact(contactId, {
            affiliations: [...others, { companyId, role, current }]
        });
    }

    detachContactFromCompany(contactId: number, companyId: number): void {
        const contact = this.contact(contactId);
        if (!contact) return;
        this.updateContact(contactId, {
            affiliations: contact.affiliations.filter(a => a.companyId !== companyId)
        });
    }

    deleteContact(id: number): void {
        this.commit(data => {
            data.contacts = data.contacts.filter(contact => contact.id !== id);
            data.applications = data.applications.map(app =>
                app.contactIds.includes(id)
                    ? { ...app, contactIds: app.contactIds.filter(contactId => contactId !== id) }
                    : app
            );
        });
    }

    // -------------------------------------------------------- candidatures

    addApplication(input: NewApplication): number {
        const companyId = input.companyId !== undefined
            ? input.companyId
            : (input.companyName ? this.ensureCompany(input.companyName) : null);

        const createdAt = input.createdAt ?? new Date().toISOString();
        const campaignId = this.activeCampaign()?.id ?? this.ensureActiveCampaign();

        let createdId = 0;
        this.commit(data => {
            createdId = this.takeId(data);
            const events: ApplicationEvent[] = [
                { id: this.takeId(data), type: 'created', at: createdAt },
                { id: this.takeId(data), type: 'status', at: createdAt, status: 'to_apply' }
            ];

            if (input.status && input.status !== 'to_apply') {
                events.push({
                    id: this.takeId(data),
                    type: 'status',
                    at: new Date().toISOString(),
                    status: input.status
                });
            }

            data.applications = [{
                id: createdId,
                campaignId,
                companyId: companyId ?? null,
                agencyName: input.agencyName,
                title: input.title,
                location: input.location,
                contractType: input.contractType,
                contractDuration: input.contractDuration,
                weeklyHours: input.weeklyHours,
                salary: input.salary,
                source: input.source,
                link: input.link,
                createdAt,
                contactIds: input.contactIds ?? [],
                posting: input.posting,
                events
            }, ...data.applications];
        });

        return createdId;
    }

    /**
     * Enregistre une candidature depuis un formulaire : crée ou met à jour,
     * puis n'ajoute que les événements réellement nouveaux. Point d'entrée
     * unique, pour que les deux écrans qui saisissent une candidature se
     * comportent exactement pareil.
     */
    applyDraft(id: number | null, draft: ApplicationDraft): number {
        const companyId = draft.companyName.trim()
            ? this.ensureCompany(draft.companyName)
            : null;

        const fields = {
            companyId,
            agencyName: companyId === null ? draft.agencyName : undefined,
            title: draft.title,
            location: draft.location,
            contractType: draft.contractType,
            contractDuration: draft.contractDuration,
            weeklyHours: draft.weeklyHours,
            salary: draft.salary,
            source: draft.source,
            link: draft.link,
            posting: draft.posting
        };

        const applicationId = id !== null
            ? (this.updateApplication(id, fields), id)
            : this.addApplication({ ...fields, companyName: undefined, status: draft.status });

        if (id !== null) {
            this.setStatus(applicationId, draft.status);
        }

        if (draft.interviewAt) {
            this.recordInterview(applicationId, draft.interviewKind ?? 'video', new Date(draft.interviewAt));
        }

        return applicationId;
    }

    /**
     * Ajoute un entretien s'il n'est pas déjà connu, et la tâche de préparation
     * qui va avec. Appeler deux fois avec la même date ne crée pas de doublon.
     */
    recordInterview(id: number, kind: InterviewKind, at: Date, details?: string): void {
        const application = this.application(id);
        if (!application) return;

        const known = interviewEvents(application).some(event =>
            new Date(event.at).getTime() === at.getTime() && event.interviewKind === kind
        );
        if (known) return;

        this.addInterview(id, kind, at, details);

        const company = this.company(application.companyId);
        this.tasksService.addTask({
            id: Date.now() + Math.floor(Math.random() * 1000),
            title: `Préparer : ${INTERVIEW_LABELS[kind].toLowerCase()}`,
            dueDate: at,
            completed: false,
            status: 'a_faire',
            priority: 'haute',
            applicationIds: [id],
            campaignId: application.campaignId,
            relatedOffers: [`${application.title} — ${company?.name ?? 'entreprise non citée'}`]
        });
    }

    updateApplication(id: number, patch: Partial<Omit<Application, 'id' | 'events'>>): void {
        this.commit(data => {
            data.applications = data.applications.map(app =>
                app.id === id ? { ...app, ...patch, id: app.id, events: app.events } : app
            );
        });
    }

    deleteApplication(id: number): void {
        this.commit(data => {
            data.applications = data.applications.filter(app => app.id !== id);
        });
    }

    /**
     * Le geste central de l'application : un statut, une date, rien d'autre.
     * L'événement s'ajoute, il ne remplace jamais le précédent.
     */
    setStatus(id: number, status: ApplicationStatus, at: Date = new Date(), details?: string): void {
        const application = this.application(id);
        if (!application || currentStatus(application) === status) {
            return;
        }
        this.commit(data => {
            data.applications = data.applications.map(app => {
                if (app.id !== id) return app;
                return {
                    ...app,
                    events: [...app.events, {
                        id: this.takeId(data),
                        type: 'status' as const,
                        at: at.toISOString(),
                        status,
                        details
                    }]
                };
            });
        });
    }

    addInterview(id: number, kind: InterviewKind, at: Date, details?: string): void {
        this.commit(data => {
            data.applications = data.applications.map(app => {
                if (app.id !== id) return app;
                return {
                    ...app,
                    events: [...app.events, {
                        id: this.takeId(data),
                        type: 'interview' as const,
                        at: at.toISOString(),
                        interviewKind: kind,
                        details
                    }]
                };
            });
        });
    }

    /**
     * Réécrit la chronologie d'une candidature. Réservé à l'édition manuelle de
     * l'historique : les identifiants manquants sont attribués au passage.
     */
    replaceEvents(id: number, events: Omit<ApplicationEvent, 'id'>[]): void {
        this.commit(data => {
            data.applications = data.applications.map(app => {
                if (app.id !== id) return app;
                return {
                    ...app,
                    events: events.map(event => ({ ...event, id: this.takeId(data) }))
                };
            });
        });
    }

    clearApplications(): void {
        this.commit(data => {
            data.applications = [];
        });
    }

    // ----------------------------------------------------------- campagnes

    private ensureActiveCampaign(): number {
        const active = this.activeCampaign();
        if (active) return active.id;

        let createdId = 0;
        this.commit(data => {
            createdId = this.takeId(data);
            data.campaigns.push({
                id: createdId,
                name: 'Ma recherche',
                startedAt: new Date().toISOString(),
                status: 'active'
            });
        });
        return createdId;
    }

    startCampaign(name: string, weeklyGoal?: number): number {
        let createdId = 0;
        this.commit(data => {
            const now = new Date().toISOString();
            data.campaigns = data.campaigns.map(campaign =>
                campaign.status === 'active'
                    ? { ...campaign, status: 'closed' as const, closedAt: campaign.closedAt ?? now }
                    : campaign
            );
            createdId = this.takeId(data);
            data.campaigns.push({
                id: createdId,
                name,
                startedAt: now,
                status: 'active',
                weeklyGoal
            });
        });
        return createdId;
    }

    /**
     * Clôture la campagne en cours. Les compteurs repartent de zéro, le réseau
     * reste : chaque candidature ne laisse qu'une ligne d'historique sur la
     * fiche entreprise (poste, issue, date), et son annonce est effacée.
     */
    closeActiveCampaign(outcome: CampaignOutcome = 'paused', clearTasks = true): void {
        const campaign = this.activeCampaign();
        if (!campaign) return;

        this.commit(data => {
            const now = new Date().toISOString();
            const closing = data.applications.filter(app => app.campaignId === campaign.id);

            // Les candidatures partent : on garde leurs chiffres avant.
            const summary = computeCampaignStats(closing, campaign.startedAt, now);

            const historyByCompany = new Map<number, Company['history']>();
            for (const app of closing) {
                if (app.companyId === null) continue;
                const outcomeStatus = currentStatus(app);
                const date = enteredStatusAt(app, outcomeStatus)
                    ?? sentAt(app)
                    ?? app.createdAt;
                const entries = historyByCompany.get(app.companyId) ?? [];
                entries.push({ campaignId: campaign.id, title: app.title, outcome: outcomeStatus, date });
                historyByCompany.set(app.companyId, entries);
            }

            data.companies = data.companies.map(company => {
                const added = historyByCompany.get(company.id);
                return added ? { ...company, history: [...company.history, ...added] } : company;
            });

            data.applications = data.applications.filter(app => app.campaignId !== campaign.id);

            data.campaigns = data.campaigns.map(entry =>
                entry.id === campaign.id
                    ? { ...entry, status: 'closed' as const, closedAt: now, outcome, summary }
                    : entry
            );

            if (clearTasks) {
                // Seules les tâches de cette campagne partent ; un rappel
                // personnel sans campagne reste.
                data.tasks = data.tasks.filter(task => task.campaignId !== campaign.id);
            }
        });

        if (clearTasks) {
            this.tasksService.setTasks(
                this.tasksService.tasks().filter(task => task.campaignId !== campaign.id)
            );
        }
    }

    /** Mémorise la réponse à « toujours en recherche ? ». */
    markSearchChecked(stillSearching: boolean): void {
        const campaign = this.activeCampaign();
        if (!campaign) return;

        if (stillSearching) {
            this.commit(data => {
                data.campaigns = data.campaigns.map(entry =>
                    entry.id === campaign.id
                        ? { ...entry, lastCheckedAt: new Date().toISOString() }
                        : entry
                );
            });
            return;
        }

        this.closeActiveCampaign('found_job');
    }

    // ---------------------------------------------------------- automatisme

    /**
     * Fait avancer les candidatures restées sans nouvelle : relance à deux
     * semaines, sans réponse à cinq. Les dates viennent des événements, donc
     * relancer l'automatisme deux fois ne produit pas de doublon.
     */
    runRelaunchAutomation(now: Date = new Date()): void {
        const applications = this.applications();
        if (applications.length === 0) return;

        const relaunchMs = RELAUNCH_AFTER_DAYS * 24 * 60 * 60 * 1000;
        const noResponseMs = NO_RESPONSE_AFTER_DAYS * 24 * 60 * 60 * 1000;

        for (const application of applications) {
            if (currentStatus(application) !== 'sent') continue;

            const since = sentAt(application) ?? application.createdAt;
            const elapsed = now.getTime() - new Date(since).getTime();

            if (elapsed >= noResponseMs) {
                this.setStatus(application.id, 'no_response', now);
            } else if (elapsed >= relaunchMs) {
                this.setStatus(application.id, 'to_relaunch', now);
                const company = this.company(application.companyId);
                this.tasksService.addTask({
                    id: Date.now() + Math.floor(Math.random() * 1000),
                    title: `Relancer ${company?.name ?? 'cette entreprise'}`,
                    dueDate: now,
                    completed: false,
                    status: 'a_faire',
                    priority: 'haute',
                    applicationIds: [application.id],
                    campaignId: application.campaignId
                });
            }
        }
    }
}
