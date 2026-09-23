import {
    Application,
    ApplicationEvent,
    ApplicationStatus,
    Campaign,
    Company,
    Contact,
    JobPosting,
    LEGACY_TO_INTERVIEW,
    LEGACY_TO_STATUS,
    Profile,
    companyKey
} from '../../models/job-search.models';
import { Task } from '../../../tasks/task.model';
import { sourceFromLink } from '../../parsing/job-offer-parser';
import {
    AppData,
    LegacyAppData,
    LegacyOffer,
    LegacyUser,
    LegacyUserData,
    SCHEMA_VERSION,
    UserData,
    emptyAppData
} from './app-data';

/**
 * Amène n'importe quel contenu lu du localStorage (ou d'un import JSON) au
 * schéma courant. La migration est sans perte : rien n'est supprimé, tout est
 * redistribué dans les bonnes entités.
 */
export function migrateAppData(raw: unknown): AppData {
    if (!raw || typeof raw !== 'object') {
        return emptyAppData();
    }

    const data = raw as Partial<AppData> & Partial<LegacyAppData>;

    if (data.schemaVersion === SCHEMA_VERSION) {
        return normalizeV2(data as AppData);
    }

    return migrateV1(data as LegacyAppData);
}

function normalizeV2(data: AppData): AppData {
    const users: AppData['users'] = {};
    for (const [userId, userData] of Object.entries(data.users || {})) {
        users[userId] = normalizeUserData(userData);
    }
    return { schemaVersion: SCHEMA_VERSION, currentUserId: data.currentUserId ?? null, users };
}

/**
 * Complète les tableaux absents et recalcule le compteur d'identifiants.
 * Appliqué à tout ce qui arrive du stockage, Firestore inclus : un document
 * écrit par une version antérieure peut manquer de champs.
 */
export function normalizeUserData(userData: UserData): UserData {
    return {
        ...userData,
        campaigns: userData.campaigns || [],
        companies: (userData.companies || []).map(company => ({
            ...company,
            history: company.history || []
        })),
        contacts: (userData.contacts || []).map(contact => ({
            ...contact,
            affiliations: contact.affiliations || []
        })),
        applications: (userData.applications || []).map(app => ({
            ...app,
            contactIds: app.contactIds || [],
            events: app.events || []
        })),
        tasks: userData.tasks || [],
        nextId: userData.nextId || nextFreeId(userData)
    };
}

function nextFreeId(userData: UserData): number {
    const ids = [
        ...(userData.campaigns || []).map(c => c.id),
        ...(userData.companies || []).map(c => c.id),
        ...(userData.contacts || []).map(c => c.id),
        ...(userData.applications || []).map(a => a.id),
        ...(userData.applications || []).flatMap(a => (a.events || []).map(e => e.id))
    ];
    return ids.length > 0 ? Math.max(...ids) + 1 : 1;
}

// ---------------------------------------------------------------------------

function migrateV1(legacy: LegacyAppData): AppData {
    const users: AppData['users'] = {};

    for (const [userId, legacyUserData] of Object.entries(legacy.users || {})) {
        if (!legacyUserData || !legacyUserData.user) continue;
        users[userId] = migrateV1User(legacyUserData);
    }

    return {
        schemaVersion: SCHEMA_VERSION,
        currentUserId: legacy.currentUserId ?? null,
        users
    };
}

function migrateV1User(legacyUserData: LegacyUserData): UserData {
    const offers = legacyUserData.offers || [];
    const profile = migrateProfile(legacyUserData.user);

    let sequence = 1;
    const nextId = () => sequence++;

    // Une seule campagne reprend tout l'historique existant : on ne peut pas
    // deviner où l'utilisateur a arrêté puis reprit sa recherche.
    const earliest = offers
        .map(o => toIso(o.dateAdded))
        .sort()[0];

    const campaign: Campaign = {
        id: nextId(),
        name: 'Ma recherche',
        startedAt: earliest || profile.createdAt,
        status: 'active'
    };

    const companies: Company[] = [];
    const companiesByKey = new Map<string, Company>();
    const contacts: Contact[] = [];
    const contactKeys = new Set<string>();

    // 1. Les entreprises, dédoublonnées par nom. L'offre la plus récente fait
    //    foi, comme le faisait getCompany() dans l'ancien service.
    const orderedOffers = [...offers].sort(
        (a, b) => new Date(toIso(b.dateAdded)).getTime() - new Date(toIso(a.dateAdded)).getTime()
    );

    for (const offer of orderedOffers) {
        const name = (offer.company || '').trim();
        if (!name) continue;

        const key = companyKey(name);
        let company = companiesByKey.get(key);

        if (!company) {
            company = {
                id: nextId(),
                name,
                createdAt: toIso(offer.dateAdded),
                employees: offer.companyInfo?.employees,
                founded: offer.companyInfo?.founded,
                group: offer.companyInfo?.group,
                description: offer.companyDescription || undefined,
                history: []
            };
            companiesByKey.set(key, company);
            companies.push(company);
        } else {
            // Offres plus anciennes : elles ne comblent que les trous.
            company.employees = company.employees ?? offer.companyInfo?.employees;
            company.founded = company.founded ?? offer.companyInfo?.founded;
            company.group = company.group ?? offer.companyInfo?.group;
            company.description = company.description ?? (offer.companyDescription || undefined);
            if (new Date(toIso(offer.dateAdded)) < new Date(company.createdAt)) {
                company.createdAt = toIso(offer.dateAdded);
            }
        }

        // 2. Les contacts sortent de la fiche entreprise et deviennent autonomes.
        for (const legacyContact of offer.companyInfo?.contacts || []) {
            const fullName = (legacyContact.name || '').trim();
            if (!fullName) continue;

            const contactKey = `${key}::${fullName.toLowerCase()}`;
            if (contactKeys.has(contactKey)) continue;
            contactKeys.add(contactKey);

            contacts.push({
                id: nextId(),
                fullName,
                role: legacyContact.role || undefined,
                email: legacyContact.email || undefined,
                phone: legacyContact.phone || undefined,
                affiliations: [{ companyId: company.id, current: true, role: legacyContact.role || undefined }],
                createdAt: toIso(offer.dateAdded)
            });
        }
    }

    // 3. Les candidatures, qui ne font plus que référencer l'entreprise.
    //    Elles prennent un identifiant du compteur, comme tout le reste :
    //    l'ancien stockage tirait les siens de Date.now() ou d'une suite qui
    //    lui était propre, et les deux auraient fini par entrer en conflit
    //    avec les identifiants créés ensuite.
    const idByOffer = new Map<number, number>();

    const applications: Application[] = offers.map(offer => {
        const name = (offer.company || '').trim();
        const company = name ? companiesByKey.get(companyKey(name)) : undefined;
        const createdAt = toIso(offer.dateAdded);
        const id = nextId();
        idByOffer.set(offer.id, id);

        return {
            id,
            campaignId: campaign.id,
            companyId: company ? company.id : null,
            title: offer.title,
            location: offer.location || undefined,
            contractType: offer.contractType || undefined,
            contractDuration: offer.contractDuration || undefined,
            weeklyHours: offer.weeklyHours || undefined,
            salary: offer.salary || undefined,
            source: sourceFromLink(offer.link),
            link: offer.link || undefined,
            createdAt,
            contactIds: [],
            posting: migratePosting(offer),
            events: migrateEvents(offer, createdAt, nextId)
        };
    });

    const migrated: UserData = {
        profile,
        nextId: Math.max(sequence, 1),
        campaigns: [campaign],
        companies,
        contacts,
        applications,
        tasks: (legacyUserData.tasks || []).map(task =>
            linkTask(task, campaign.id, offers, idByOffer)
        )
    };

    // Filet : si un identifiant venait d'ailleurs que du compteur, le compteur
    // se replace au-dessus plutôt que de recréer un doublon.
    migrated.nextId = Math.max(migrated.nextId, nextFreeId(migrated));
    return migrated;
}

/**
 * Rattache une tâche à ses candidatures. L'ancien format ne gardait qu'un
 * libellé « Poste - Entreprise - Statut » : on retrouve l'offre par ce préfixe,
 * et on conserve le libellé quand la correspondance échoue.
 */
function linkTask(
    task: Task,
    campaignId: number,
    offers: LegacyOffer[],
    idByOffer: Map<number, number>
): Task {
    const matched = new Set<number>();

    for (const label of task.relatedOffers || []) {
        const offer = offers.find(entry => label.startsWith(`${entry.title} - ${entry.company}`));
        const id = offer ? idByOffer.get(offer.id) : undefined;
        if (id !== undefined) matched.add(id);
    }

    return {
        ...task,
        campaignId,
        applicationIds: matched.size > 0 ? [...matched] : undefined,
        relatedOffers: matched.size > 0 ? undefined : task.relatedOffers
    };
}

function migrateProfile(user: LegacyUser): Profile {
    return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        // Le mot de passe de l'ancienne version n'est pas repris : c'est
        // Firebase qui gère l'authentification, l'application ne le voit plus.
        createdAt: toIso(user.createdAt || new Date()),
        title: user.title || undefined,
        location: user.location || undefined,
        skills: user.skills && user.skills.length > 0 ? user.skills : undefined
    };
}

function migratePosting(offer: LegacyOffer): JobPosting | undefined {
    const posting: JobPosting = {
        description: offer.description || undefined,
        missions: offer.missions || undefined,
        profile: offer.profile || undefined,
        benefits: offer.benefits || undefined,
        recruitmentProcess: offer.recruitmentProcess || undefined,
        others: offer.others || undefined
    };
    const hasContent = Object.values(posting).some(value => !!value);
    return hasContent ? posting : undefined;
}

/**
 * Reconstruit la chronologie. L'ancien `statusHistory` devient une suite
 * d'événements datés ; les entretiens en deviennent aussi.
 */
function migrateEvents(offer: LegacyOffer, createdAt: string, nextId: () => number): ApplicationEvent[] {
    const events: ApplicationEvent[] = [
        { id: nextId(), type: 'created', at: createdAt }
    ];

    const history = offer.statusHistory && offer.statusHistory.length > 0
        ? offer.statusHistory
        : [{ status: offer.status, date: createdAt }];

    for (const entry of history) {
        const status = LEGACY_TO_STATUS[entry.status];
        if (!status) continue;
        events.push({
            id: nextId(),
            type: 'status',
            at: toIso(entry.date),
            status,
            details: entry.details || undefined
        });
    }

    // Filet de sécurité : si l'historique ne mène pas au statut affiché
    // jusqu'ici, on ajoute l'événement manquant à la date de dernière trace.
    const expected: ApplicationStatus | undefined = LEGACY_TO_STATUS[offer.status];
    const lastStatus = [...events].reverse().find(e => e.type === 'status')?.status;
    if (expected && lastStatus !== expected) {
        const lastAt = events[events.length - 1]?.at || createdAt;
        events.push({ id: nextId(), type: 'status', at: lastAt, status: expected });
    }

    const interviews = offer.interviews && offer.interviews.length > 0
        ? offer.interviews
        : (offer.interviewDate && offer.interviewType
            ? [{ date: offer.interviewDate, type: offer.interviewType }]
            : []);

    for (const interview of interviews) {
        events.push({
            id: nextId(),
            type: 'interview',
            at: toIso(interview.date),
            interviewKind: LEGACY_TO_INTERVIEW[interview.type] || 'video',
            details: (interview as { details?: string }).details || undefined
        });
    }

    return events;
}

function toIso(value: string | Date): string {
    if (value instanceof Date) return value.toISOString();
    const date = new Date(value);
    return isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
}
