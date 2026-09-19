import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import {
    Application,
    ApplicationEvent,
    ApplicationStatus,
    Campaign,
    CampaignOutcome,
    Company,
    Contact,
    InterviewKind,
    JobPosting,
    companyKey,
    currentStatus,
    enteredStatusAt,
    sentAt
} from '../models/job-search.models';
import { UserData } from './storage/app-data';
import { AuthService } from './auth.service';
import { LocalStorageService } from './local-storage.service';
import { TasksService } from './tasks.service';

/** Délai avant de proposer une relance, puis de classer sans réponse. */
export const RELAUNCH_AFTER_DAYS = 14;
export const NO_RESPONSE_AFTER_DAYS = 35;

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
    private storage = inject(LocalStorageService);
    private auth = inject(AuthService);
    private tasksService = inject(TasksService);

    private data = signal<UserData | null>(null);

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
        effect(() => {
            const user = this.auth.currentUser();
            if (!user) {
                this.data.set(null);
                return;
            }
            this.data.set(this.storage.getUserData());
            untracked(() => this.runRelaunchAutomation());
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
     * Toute écriture relit d'abord le stockage. `TasksService` écrit dans le
     * même bloc de son côté : partir d'un instantané en mémoire ferait perdre
     * ses tâches à la première candidature modifiée.
     */
    private commit(mutate: (data: UserData) => void): void {
        const stored = this.storage.getUserData();
        if (!stored) return;

        const next: UserData = {
            ...stored,
            campaigns: [...stored.campaigns],
            companies: [...stored.companies],
            contacts: [...stored.contacts],
            applications: [...stored.applications],
            tasks: [...stored.tasks]
        };

        mutate(next);
        this.storage.setUserData(next);
        this.data.set(next);
    }

    private takeId(data: UserData): number {
        const id = data.nextId;
        data.nextId = id + 1;
        return id;
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
                    ? { ...entry, status: 'closed' as const, closedAt: now, outcome }
                    : entry
            );

            if (clearTasks) {
                data.tasks = [];
            }
        });

        if (clearTasks) {
            this.tasksService.setTasks([]);
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
                    title: 'À relancer',
                    dueDate: now,
                    completed: false,
                    status: 'a_faire',
                    priority: 'haute',
                    relatedOffers: [
                        `${application.title} - ${company?.name ?? 'Entreprise non communiquée'} - À relancer`
                    ]
                });
            }
        }
    }
}
