import { Injectable, computed, inject } from '@angular/core';
import {
    Application,
    ApplicationEvent,
    ApplicationStatus,
    Company,
    INTERVIEW_TO_LEGACY,
    JobPosting,
    LEGACY_TO_INTERVIEW,
    LEGACY_TO_STATUS,
    LegacyInterviewType,
    LegacyStatus,
    STATUS_TO_LEGACY,
    currentStatus,
    interviewEvents,
    statusEvents
} from '../models/job-search.models';
import { JobSearchStore } from './job-search-store.service';
import { TasksService } from './tasks.service';

export interface StatusHistoryEntry {
    status: string;
    date: Date;
    details?: string;
}

export interface Interview {
    date: Date;
    type: LegacyInterviewType;
    details?: string;
}

/**
 * Vue « offre » du modèle, telle que la consomment les écrans actuels.
 * Elle disparaîtra avec eux : les nouveaux écrans lisent `JobSearchStore`.
 */
export interface JobOffer {
    id: number;
    title: string;
    company: string;
    status: LegacyStatus;
    location: string;
    salary?: string;
    dateAdded: Date;
    description?: string;
    contractDuration?: string;
    weeklyHours?: string;
    contractType?: string;
    link?: string;
    /** HelloWork, France Travail, candidature spontanée… */
    source?: string;
    /** Intermédiaire quand l'employeur final n'est pas nommé. */
    agencyName?: string;
    /**
     * Statut du nouveau modèle, écrit par le formulaire refait. Jamais projeté :
     * les écrans encore en place continuent de passer par `status`.
     */
    statusValue?: ApplicationStatus;
    companyDescription?: string;
    missions?: string;
    profile?: string;
    benefits?: string;
    recruitmentProcess?: string;
    others?: string;
    statusHistory?: StatusHistoryEntry[];
    interviewDate?: Date;
    interviewType?: LegacyInterviewType;
    interviews?: Interview[];
    companyInfo?: {
        id?: number;
        employees?: number;
        founded?: number;
        group?: string;
        contacts?: {
            name: string;
            role?: string;
            email?: string;
            phone?: string;
        }[];
    };
}

/** Affiché quand l'employeur n'est pas nommé (intérim, cabinet). */
export const NO_COMPANY_LABEL = 'Entreprise non communiquée';

/** Une entrée d'historique de statut, sans identifiant. */
type StatusEntry = {
    type: 'status';
    at: string;
    status: ApplicationStatus;
    details?: string;
};

/** Libellés historiques : inchangés tant que les écrans ne sont pas refaits. */
const LEGACY_STATUS_LABELS: Record<string, string> = {
    'To Apply': 'À postuler',
    'Applied': 'En attente',
    'To Relaunch': 'À relancer',
    'No Response': 'Sans réponse',
    'Interview': 'Entretien',
    'Offer': 'Offre reçue',
    'Rejected': 'Refusé'
};

/**
 * Adaptateur entre les écrans existants et le nouveau modèle.
 *
 * Il ne détient plus aucune donnée : il projette les candidatures du store en
 * `JobOffer` et retraduit les écritures. C'est ce qui permet de basculer le
 * modèle sans réécrire l'interface d'un seul coup.
 */
@Injectable({
    providedIn: 'root'
})
export class OffersService {
    private store = inject(JobSearchStore);
    private tasksService = inject(TasksService);

    offers = computed<JobOffer[]>(() => {
        const companies = this.store.companies();
        return this.store.applications()
            .map(application => this.toJobOffer(application, companies))
            .sort((a, b) => b.dateAdded.getTime() - a.dateAdded.getTime());
    });

    getOffer(id: number): JobOffer | undefined {
        return this.offers().find(offer => offer.id === id);
    }

    getStatusLabel(status: string): string {
        return LEGACY_STATUS_LABELS[status] || status;
    }

    // ---------------------------------------------------------------- lecture

    private toJobOffer(application: Application, companies: Company[]): JobOffer {
        const company = application.companyId !== null
            ? companies.find(entry => entry.id === application.companyId)
            : undefined;

        const interviews: Interview[] = interviewEvents(application).map(event => ({
            date: new Date(event.at),
            type: INTERVIEW_TO_LEGACY[event.interviewKind ?? 'video'],
            details: event.details
        }));

        const last = interviews.length > 0 ? interviews[interviews.length - 1] : undefined;
        const contacts = company
            ? this.store.contactsOfCompany(company.id).map(contact => ({
                name: contact.fullName,
                role: contact.role,
                email: contact.email,
                phone: contact.phone
            }))
            : undefined;

        return {
            id: application.id,
            title: application.title,
            company: company?.name ?? NO_COMPANY_LABEL,
            status: STATUS_TO_LEGACY[currentStatus(application)],
            location: application.location ?? '',
            salary: application.salary,
            dateAdded: new Date(application.createdAt),
            description: application.posting?.description,
            contractDuration: application.contractDuration,
            weeklyHours: application.weeklyHours,
            contractType: application.contractType,
            link: application.link,
            source: application.source,
            agencyName: application.agencyName,
            companyDescription: company?.description,
            missions: application.posting?.missions,
            profile: application.posting?.profile,
            benefits: application.posting?.benefits,
            recruitmentProcess: application.posting?.recruitmentProcess,
            others: application.posting?.others,
            statusHistory: statusEvents(application).map(event => ({
                status: STATUS_TO_LEGACY[event.status!],
                date: new Date(event.at),
                details: event.details
            })),
            interviewDate: last?.date,
            interviewType: last?.type,
            interviews: interviews.length > 0 ? interviews : undefined,
            companyInfo: {
                id: company?.id,
                employees: company?.employees,
                founded: company?.founded,
                group: company?.group,
                contacts: contacts && contacts.length > 0 ? contacts : undefined
            }
        };
    }

    // --------------------------------------------------------------- écriture

    addOffer(offer: JobOffer): void {
        const companyId = this.resolveCompanyId(offer.company);

        const id = this.store.addApplication({
            title: offer.title,
            companyId,
            location: offer.location,
            contractType: offer.contractType,
            contractDuration: offer.contractDuration,
            weeklyHours: offer.weeklyHours,
            salary: offer.salary,
            link: offer.link,
            source: offer.source,
            agencyName: companyId === null ? offer.agencyName : undefined,
            posting: toPosting(offer),
            status: targetStatus(offer),
            createdAt: toIso(offer.dateAdded)
        });

        this.syncInterviews(id, offer);
    }

    updateOffer(updated: JobOffer): void {
        const application = this.store.application(updated.id);
        if (!application) return;

        const companyId = this.resolveCompanyId(updated.company);

        this.store.updateApplication(updated.id, {
            companyId,
            title: updated.title,
            location: updated.location,
            contractType: updated.contractType,
            contractDuration: updated.contractDuration,
            weeklyHours: updated.weeklyHours,
            salary: updated.salary,
            link: updated.link,
            source: updated.source,
            agencyName: companyId === null ? updated.agencyName : undefined,
            posting: toPosting(updated)
        });

        this.applyHistory(updated.id, updated);
        this.syncInterviews(updated.id, updated);
    }

    deleteOffer(id: number): void {
        this.store.deleteApplication(id);
    }

    clearAll(): void {
        this.store.clearApplications();
    }

    /**
     * Rejoue l'historique fourni par l'écran, puis ajoute l'événement manquant
     * si le statut affiché a changé. L'ancien écran traite `statusHistory`
     * comme éditable : on l'accepte tel quel.
     */
    private applyHistory(id: number, offer: JobOffer): void {
        const application = this.store.application(id);
        if (!application) return;

        const target = targetStatus(offer);

        const fromScreen: StatusEntry[] = (offer.statusHistory ?? [])
            .flatMap(entry => {
                const status = LEGACY_TO_STATUS[entry.status];
                if (!status) return [];
                return [{ type: 'status' as const, at: toIso(entry.date), status, details: entry.details }];
            })
            .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());

        const existing: StatusEntry[] = statusEvents(application).map(event => ({
            type: 'status' as const,
            at: event.at,
            status: event.status!,
            details: event.details
        }));

        const history = fromScreen.length > 0 ? fromScreen : existing;
        const unchanged = sameHistory(history, existing);

        const last = history.length > 0 ? history[history.length - 1].status : 'to_apply';
        const needsStatusEvent = last !== target;

        if (unchanged && !needsStatusEvent) {
            return;
        }

        if (unchanged && needsStatusEvent) {
            // Cas courant : seul le statut a été changé dans le formulaire.
            this.store.setStatus(id, target);
            return;
        }

        const events: Omit<ApplicationEvent, 'id'>[] = [
            { type: 'created', at: application.createdAt },
            ...history
        ];

        if (needsStatusEvent) {
            events.push({ type: 'status', at: new Date().toISOString(), status: target });
        }

        for (const event of application.events.filter(e => e.type === 'interview')) {
            events.push({
                type: 'interview',
                at: event.at,
                interviewKind: event.interviewKind,
                details: event.details
            });
        }

        this.store.replaceEvents(id, events);
    }

    /** Ajoute les entretiens nouvellement saisis, et la tâche qui va avec. */
    private syncInterviews(id: number, offer: JobOffer): void {
        const application = this.store.application(id);
        if (!application) return;

        const wanted: Interview[] = offer.interviews
            ? [...offer.interviews]
            : (offer.interviewDate && offer.interviewType
                ? [{ date: offer.interviewDate, type: offer.interviewType }]
                : []);

        if (offer.interviewDate && offer.interviewType) {
            const alreadyWanted = wanted.some(interview =>
                toIso(interview.date) === toIso(offer.interviewDate!) && interview.type === offer.interviewType
            );
            if (!alreadyWanted) {
                wanted.push({ date: offer.interviewDate, type: offer.interviewType });
            }
        }

        const existing = interviewEvents(application).map(event => ({
            at: event.at,
            kind: event.interviewKind ?? 'video'
        }));

        for (const interview of wanted) {
            const kind = LEGACY_TO_INTERVIEW[interview.type] ?? 'video';
            const at = toIso(interview.date);
            const known = existing.some(event => event.at === at && event.kind === kind);
            if (known) continue;

            this.store.addInterview(id, kind, new Date(at), interview.details);
            existing.push({ at, kind });

            const company = this.store.company(this.store.application(id)?.companyId);
            this.tasksService.addTask({
                id: Date.now() + Math.floor(Math.random() * 1000),
                title: kind === 'prequal' ? 'Préqualification' : interview.type,
                dueDate: new Date(at),
                completed: false,
                status: 'a_faire',
                priority: 'haute',
                relatedOffers: [
                    `${offer.title} - ${company?.name ?? NO_COMPANY_LABEL} - ${this.getStatusLabel(offer.status)}`
                ]
            });
        }
    }

    private resolveCompanyId(name: string | undefined): number | null {
        const trimmed = (name || '').trim();
        if (!trimmed || trimmed === NO_COMPANY_LABEL) {
            return null;
        }
        return this.store.ensureCompany(trimmed);
    }
}

// --------------------------------------------------------------------------

/** Le statut visé : celui du nouveau modèle s'il est fourni, sinon l'ancien. */
function targetStatus(offer: JobOffer): ApplicationStatus {
    return offer.statusValue ?? LEGACY_TO_STATUS[offer.status] ?? 'to_apply';
}

function toPosting(offer: JobOffer): JobPosting | undefined {
    const posting: JobPosting = {
        description: emptyToUndefined(offer.description),
        missions: emptyToUndefined(offer.missions),
        profile: emptyToUndefined(offer.profile),
        benefits: emptyToUndefined(offer.benefits),
        recruitmentProcess: emptyToUndefined(offer.recruitmentProcess),
        others: emptyToUndefined(offer.others)
    };
    return Object.values(posting).some(value => !!value) ? posting : undefined;
}

function sameHistory(
    a: { at: string; status: ApplicationStatus }[],
    b: { at: string; status: ApplicationStatus }[]
): boolean {
    if (a.length !== b.length) return false;
    return a.every((entry, index) =>
        entry.status === b[index].status &&
        new Date(entry.at).getTime() === new Date(b[index].at).getTime()
    );
}

function toIso(value: Date | string): string {
    const date = value instanceof Date ? value : new Date(value);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}

function emptyToUndefined(value: unknown): string | undefined {
    if (typeof value !== 'string') return undefined;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
}

function numberOrUndefined(value: unknown): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const parsed = Number(value);
    return isNaN(parsed) ? undefined : parsed;
}
