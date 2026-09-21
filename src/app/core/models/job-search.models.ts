/**
 * Modèle de données de la recherche d'emploi.
 *
 * Trois règles structurent ce fichier :
 *  1. Entreprise et Contact vivent au-dessus des campagnes : une remise à zéro
 *     ne les touche pas.
 *  2. Une candidature *référence* une entreprise (companyId), elle ne la copie
 *     jamais. companyId peut valoir null : « pour notre client », employeur non
 *     communiqué.
 *  3. Le statut n'est pas un champ mutable mais le dernier événement daté de la
 *     candidature. Un refus du 3 juin reste en juin, quoi qu'il arrive ensuite.
 */

/** Affiché quand l'employeur n'est pas nommé (intérim, cabinet). */
export const NO_COMPANY_LABEL = 'Entreprise non communiquée';

export const APPLICATION_STATUSES = [
    'to_apply',
    'sent',
    'to_relaunch',
    'no_response',
    'interview',
    'offer',
    'rejected',
    'withdrawn'
] as const;

export type ApplicationStatus = typeof APPLICATION_STATUSES[number];

/** Libellés de la refonte (utilisés par les nouveaux écrans). */
export const STATUS_LABELS: Record<ApplicationStatus, string> = {
    to_apply: 'À postuler',
    sent: 'Envoyée',
    to_relaunch: 'À relancer',
    no_response: 'Sans réponse',
    interview: 'Entretien',
    offer: 'Offre reçue',
    rejected: 'Refusée',
    withdrawn: 'Abandonnée'
};

/** Statuts qui signifient « la candidature est partie ». */
export const SENT_STATUSES: ApplicationStatus[] = [
    'sent', 'to_relaunch', 'no_response', 'interview', 'offer', 'rejected', 'withdrawn'
];

/** Statuts qui signifient « l'entreprise a répondu ». */
export const ANSWERED_STATUSES: ApplicationStatus[] = ['interview', 'offer', 'rejected'];

/** Statuts terminaux : plus rien n'est attendu. */
export const CLOSED_STATUSES: ApplicationStatus[] = ['offer', 'rejected', 'withdrawn', 'no_response'];

export type InterviewKind = 'prequal' | 'phone' | 'video' | 'onsite';

export const INTERVIEW_LABELS: Record<InterviewKind, string> = {
    prequal: 'Préqualification',
    phone: 'Entretien téléphonique',
    video: 'Entretien visio',
    onsite: 'Entretien sur place'
};

export type ApplicationEventType = 'created' | 'status' | 'interview' | 'relaunch' | 'note';

/**
 * Un fait daté, jamais modifié après coup. C'est la seule source des
 * statistiques : elles comptent des événements, pas des états du jour.
 */
export interface ApplicationEvent {
    id: number;
    type: ApplicationEventType;
    /** Date ISO de l'événement. */
    at: string;
    /** Renseigné pour type === 'status'. */
    status?: ApplicationStatus;
    /** Renseigné pour type === 'interview'. */
    interviewKind?: InterviewKind;
    details?: string;
}

/** Contenu de l'annonce : effacé à la clôture d'une campagne, contrairement au reste. */
export interface JobPosting {
    description?: string;
    missions?: string;
    profile?: string;
    benefits?: string;
    recruitmentProcess?: string;
    others?: string;
}

export interface Application {
    id: number;
    campaignId: number;
    /** null = employeur non communiqué (intérim, cabinet). */
    companyId: number | null;
    /** Intermédiaire quand l'employeur final n'est pas nommé. */
    agencyName?: string;
    /** Le seul champ réellement obligatoire. */
    title: string;
    location?: string;
    contractType?: string;
    contractDuration?: string;
    weeklyHours?: string;
    salary?: string;
    /** HelloWork, France Travail, candidature spontanée, réseau… */
    source?: string;
    link?: string;
    createdAt: string;
    contactIds: number[];
    posting?: JobPosting;
    events: ApplicationEvent[];
}

/** Ce qui reste d'une candidature après clôture de sa campagne. */
export interface CompanyHistoryEntry {
    campaignId: number;
    title: string;
    outcome: ApplicationStatus;
    /** Date ISO de l'issue. */
    date: string;
}

export interface Company {
    id: number;
    name: string;
    sector?: string;
    website?: string;
    employees?: number;
    founded?: number;
    group?: string;
    description?: string;
    notes?: string;
    tags?: string[];
    createdAt: string;
    /** Mémoire longue : « 3 refus pour des postes d'assistante depuis 2024 ». */
    history: CompanyHistoryEntry[];
}

export interface ContactAffiliation {
    companyId: number;
    role?: string;
    /** false = ancien poste, on garde le lien pour l'historique. */
    current: boolean;
}

export interface Contact {
    id: number;
    fullName: string;
    role?: string;
    email?: string;
    phone?: string;
    linkedin?: string;
    notes?: string;
    affiliations: ContactAffiliation[];
    createdAt: string;
    lastInteractionAt?: string;
}

export type CampaignOutcome = 'found_job' | 'paused' | 'other';

/**
 * Photographie d'une campagne, figée à sa clôture.
 *
 * Les candidatures sont effacées à ce moment-là : sans ce résumé, les chiffres
 * d'une campagne passée disparaîtraient avec elles. Il est immuable.
 */
export interface CampaignSummary {
    /** Candidatures créées, envoyées ou non. */
    applications: number;
    sent: number;
    answered: number;
    interviews: number;
    offers: number;
    rejected: number;
    noResponse: number;
    relaunched: number;
    /** Relances suivies d'une réponse. */
    relaunchesAnswered: number;
    bySource: { source: string; sent: number; answered: number }[];
    /** Délai médian entre l'envoi et la première réponse, en jours. */
    medianResponseDays: number | null;
    from: string;
    to: string;
}

export interface Campaign {
    id: number;
    name: string;
    startedAt: string;
    closedAt?: string;
    status: 'active' | 'closed';
    /** Candidatures visées par semaine, sert au calcul du rythme. */
    weeklyGoal?: number;
    outcome?: CampaignOutcome;
    /** Dernière fois où l'on a demandé « toujours en recherche ? ». */
    lastCheckedAt?: string;
    /** Renseigné à la clôture uniquement. */
    summary?: CampaignSummary;
}

export interface ProfileDocument {
    id: number;
    label: string;
    fileName: string;
    kind: 'cv' | 'cover_letter' | 'portfolio' | 'other';
    addedAt: string;
}

export interface Profile {
    id: string;
    fullName: string;
    email: string;
    /**
     * Stocké en clair, comme dans la version précédente. Remplacé par Firebase
     * Auth au chantier 5 ; ne pas ajouter d'autre usage d'ici là.
     */
    password: string;
    authMethod: 'email';
    createdAt: string;
    title?: string;
    location?: string;
    skills?: string[];
    phone?: string;
    /** Zone de recherche : « Rennes + 50 km, full remote ». */
    searchZone?: string;
    targetRoles?: string[];
    contractTypes?: string[];
    salaryExpectation?: string;
    availability?: string;
    linkedin?: string;
    portfolio?: string;
    documents?: ProfileDocument[];
}

// ---------------------------------------------------------------------------
// Lecture du statut : dérivée des événements, jamais stockée.
// ---------------------------------------------------------------------------

/** Événements de statut, du plus ancien au plus récent. */
export function statusEvents(application: Application): ApplicationEvent[] {
    return application.events
        .filter(e => e.type === 'status' && !!e.status)
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/** Statut courant : le dernier événement de statut en date. */
export function currentStatus(application: Application): ApplicationStatus {
    const events = statusEvents(application);
    return events.length > 0 ? events[events.length - 1].status! : 'to_apply';
}

/** Statut de la candidature à une date donnée (null si elle n'existait pas encore). */
export function statusAt(application: Application, date: Date): ApplicationStatus | null {
    const time = date.getTime();
    if (new Date(application.createdAt).getTime() > time) {
        return null;
    }
    let status: ApplicationStatus = 'to_apply';
    for (const event of statusEvents(application)) {
        if (new Date(event.at).getTime() > time) break;
        status = event.status!;
    }
    return status;
}

/** Date ISO du dernier passage à `status`, si elle est passée par là. */
export function enteredStatusAt(application: Application, status: ApplicationStatus): string | undefined {
    const matches = statusEvents(application).filter(e => e.status === status);
    return matches.length > 0 ? matches[matches.length - 1].at : undefined;
}

/** Date ISO de l'envoi de la candidature. */
export function sentAt(application: Application): string | undefined {
    const first = statusEvents(application).find(e => SENT_STATUSES.includes(e.status!));
    return first?.at;
}

/** Entretiens de la candidature, du plus proche au plus lointain. */
export function interviewEvents(application: Application): ApplicationEvent[] {
    return application.events
        .filter(e => e.type === 'interview')
        .sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

/**
 * Compte les candidatures qui sont *entrées* dans `status` pendant la période.
 * C'est la seule façon correcte de remplir un graphique mensuel : contrairement
 * à un comptage d'états courants, le chiffre d'un mois passé ne bouge plus.
 */
export function countEnteredStatus(
    applications: Application[],
    status: ApplicationStatus,
    from: Date,
    to: Date
): number {
    const start = from.getTime();
    const end = to.getTime();
    return applications.filter(app =>
        statusEvents(app).some(e => {
            if (e.status !== status) return false;
            const at = new Date(e.at).getTime();
            return at >= start && at <= end;
        })
    ).length;
}

/** Comme `countEnteredStatus`, pour un ensemble de statuts (« a répondu »). */
export function countEnteredAny(
    applications: Application[],
    statuses: ApplicationStatus[],
    from: Date,
    to: Date
): number {
    const start = from.getTime();
    const end = to.getTime();
    return applications.filter(app =>
        statusEvents(app).some(e => {
            if (!statuses.includes(e.status!)) return false;
            const at = new Date(e.at).getTime();
            return at >= start && at <= end;
        })
    ).length;
}

/** La candidature est-elle passée par ce statut, à un moment quelconque ? */
export function everEntered(application: Application, status: ApplicationStatus): boolean {
    return statusEvents(application).some(event => event.status === status);
}

/** Date ISO de la première réponse de l'entreprise, si elle a répondu. */
export function firstAnswerAt(application: Application): string | undefined {
    return statusEvents(application).find(event => ANSWERED_STATUSES.includes(event.status!))?.at;
}

/** Délai en jours entre l'envoi et la première réponse. */
export function responseDelayDays(application: Application): number | null {
    const sent = sentAt(application);
    const answered = firstAnswerAt(application);
    if (!sent || !answered) return null;
    const days = (new Date(answered).getTime() - new Date(sent).getTime()) / 86400000;
    return days >= 0 ? Math.round(days) : null;
}

/**
 * Candidatures *parties* pendant la période. On regarde la date du premier
 * statut d'envoi, pas le statut du jour : une candidature envoyée en juin puis
 * refusée en août reste un envoi de juin.
 */
export function countSentIn(applications: Application[], from: Date, to: Date): number {
    return applications.filter(app => inRange(sentAt(app), from, to)).length;
}

/** Candidatures dont l'entreprise a répondu pendant la période. */
export function countAnsweredIn(applications: Application[], from: Date, to: Date): number {
    return applications.filter(app => inRange(firstAnswerAt(app), from, to)).length;
}

function inRange(iso: string | undefined, from: Date, to: Date): boolean {
    if (!iso) return false;
    const at = new Date(iso).getTime();
    return at >= from.getTime() && at <= to.getTime();
}

export function median(values: number[]): number | null {
    if (values.length === 0) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 0
        ? Math.round((sorted[middle - 1] + sorted[middle]) / 2)
        : sorted[middle];
}

/**
 * Chiffres d'un ensemble de candidatures, comptés sur les événements.
 *
 * Une candidature compte dans « envoyées » parce qu'elle est *passée* par un
 * statut d'envoi, pas parce qu'elle s'y trouve aujourd'hui : un refus ne fait
 * pas disparaître l'envoi qui l'a précédé.
 */
export function computeCampaignStats(
    applications: Application[],
    from: string,
    to: string
): CampaignSummary {
    const sent = applications.filter(app => !!sentAt(app));
    const answered = applications.filter(app => !!firstAnswerAt(app));
    const relaunched = applications.filter(app => everEntered(app, 'to_relaunch'));

    const bySourceMap = new Map<string, { sent: number; answered: number }>();
    for (const application of sent) {
        const key = application.source?.trim() || 'Source non renseignée';
        const entry = bySourceMap.get(key) ?? { sent: 0, answered: 0 };
        entry.sent++;
        if (firstAnswerAt(application)) entry.answered++;
        bySourceMap.set(key, entry);
    }

    const delays = applications
        .map(responseDelayDays)
        .filter((days): days is number => days !== null);

    return {
        applications: applications.length,
        sent: sent.length,
        answered: answered.length,
        interviews: applications.filter(app => everEntered(app, 'interview')).length,
        offers: applications.filter(app => everEntered(app, 'offer')).length,
        rejected: applications.filter(app => everEntered(app, 'rejected')).length,
        noResponse: applications.filter(app => currentStatus(app) === 'no_response').length,
        relaunched: relaunched.length,
        relaunchesAnswered: relaunched.filter(app => {
            const relaunchAt = enteredStatusAt(app, 'to_relaunch');
            const answer = firstAnswerAt(app);
            return !!relaunchAt && !!answer && new Date(answer) > new Date(relaunchAt);
        }).length,
        bySource: [...bySourceMap.entries()]
            .map(([source, counts]) => ({ source, ...counts }))
            .sort((a, b) => (b.answered / b.sent) - (a.answered / a.sent) || b.sent - a.sent),
        medianResponseDays: median(delays),
        from,
        to
    };
}

// ---------------------------------------------------------------------------
// Complétion du profil
// ---------------------------------------------------------------------------

export interface ProfileChecklistItem {
    key: string;
    label: string;
    done: boolean;
}

/**
 * Ce qui rend un profil utile : chaque ligne manquante dégrade quelque chose
 * de concret (pertinence des suggestions, lettres générées, calcul du rythme).
 */
export function profileChecklist(profile: Profile | null): ProfileChecklistItem[] {
    const filled = (value?: string) => !!value && value.trim().length > 0;
    const listed = (value?: string[], min = 1) => !!value && value.length >= min;

    return [
        { key: 'title', label: 'Intitulé de poste', done: filled(profile?.title) },
        { key: 'location', label: 'Localisation', done: filled(profile?.location) },
        { key: 'phone', label: 'Téléphone', done: filled(profile?.phone) },
        { key: 'searchZone', label: 'Zone de recherche', done: filled(profile?.searchZone) },
        { key: 'targetRoles', label: 'Métiers visés', done: listed(profile?.targetRoles) },
        { key: 'contractTypes', label: 'Types de contrat', done: listed(profile?.contractTypes) },
        { key: 'skills', label: 'Compétences clés (3 minimum)', done: listed(profile?.skills, 3) },
        { key: 'salary', label: 'Prétentions salariales', done: filled(profile?.salaryExpectation) },
        { key: 'availability', label: 'Disponibilité', done: filled(profile?.availability) },
        {
            key: 'links',
            label: 'LinkedIn ou portfolio',
            done: filled(profile?.linkedin) || filled(profile?.portfolio)
        },
        { key: 'documents', label: 'Un CV référencé', done: (profile?.documents?.length ?? 0) > 0 }
    ];
}

/** Part des lignes remplies, en pourcentage entier. */
export function profileCompletion(items: ProfileChecklistItem[]): number {
    if (items.length === 0) return 0;
    return Math.round((items.filter(item => item.done).length / items.length) * 100);
}

// ---------------------------------------------------------------------------
// Passerelle avec l'ancien vocabulaire (adaptateur OffersService, migration).
// ---------------------------------------------------------------------------

export type LegacyStatus =
    'To Apply' | 'Applied' | 'Interview' | 'Offer' | 'Rejected' | 'To Relaunch' | 'No Response';

export const LEGACY_TO_STATUS: Record<string, ApplicationStatus> = {
    'To Apply': 'to_apply',
    'Applied': 'sent',
    'To Relaunch': 'to_relaunch',
    'No Response': 'no_response',
    'Interview': 'interview',
    'Offer': 'offer',
    'Rejected': 'rejected'
};

export const STATUS_TO_LEGACY: Record<ApplicationStatus, LegacyStatus> = {
    to_apply: 'To Apply',
    sent: 'Applied',
    to_relaunch: 'To Relaunch',
    no_response: 'No Response',
    interview: 'Interview',
    offer: 'Offer',
    rejected: 'Rejected',
    withdrawn: 'No Response'
};

export type LegacyInterviewType =
    'Préqual' | 'Entretien Physique' | 'Entretien Téléphonique' | 'Entretien Visio';

export const LEGACY_TO_INTERVIEW: Record<string, InterviewKind> = {
    'Préqual': 'prequal',
    'Entretien Physique': 'onsite',
    'Entretien Téléphonique': 'phone',
    'Entretien Visio': 'video'
};

export const INTERVIEW_TO_LEGACY: Record<InterviewKind, LegacyInterviewType> = {
    prequal: 'Préqual',
    onsite: 'Entretien Physique',
    phone: 'Entretien Téléphonique',
    video: 'Entretien Visio'
};

/** Clé de regroupement d'une entreprise par son nom (casse et espaces ignorés). */
export function companyKey(name: string): string {
    return name.trim().toLowerCase().replace(/\s+/g, ' ');
}
