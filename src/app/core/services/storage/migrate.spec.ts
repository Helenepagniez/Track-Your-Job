import {
    countEnteredStatus,
    currentStatus,
    enteredStatusAt,
    interviewEvents
} from '../../models/job-search.models';
import { LegacyAppData } from './app-data';
import { migrateAppData, sourceFromLink } from './migrate';

function legacyData(): LegacyAppData {
    return {
        currentUserId: 'user_1',
        users: {
            user_1: {
                user: {
                    id: 'user_1',
                    fullName: 'Prénom Nom',
                    email: 'compte@example.com',
                    password: 'secret',
                    authMethod: 'email',
                    createdAt: '2025-04-24T08:00:00.000Z',
                    title: 'Chargée de communication',
                    location: 'Rennes'
                },
                offers: [
                    {
                        id: 1001,
                        title: 'Candidature spontanée',
                        company: 'Sopra Steria',
                        status: 'To Apply',
                        location: 'Rennes',
                        dateAdded: '2026-09-09T09:00:00.000Z',
                        companyInfo: { id: 3, employees: 50000, contacts: [] }
                    },
                    {
                        id: 1004,
                        title: "Chargé d'acquisition BtoB & CRM",
                        company: 'HelloWork',
                        status: 'Rejected',
                        location: 'Rennes',
                        dateAdded: '2026-06-02T09:00:00.000Z',
                        link: 'https://fr.indeed.com/viewjob?jk=abc',
                        statusHistory: [
                            { status: 'To Apply', date: '2026-06-02T09:00:00.000Z' },
                            { status: 'Applied', date: '2026-06-03T09:00:00.000Z' },
                            { status: 'Rejected', date: '2026-06-18T09:00:00.000Z' }
                        ],
                        companyInfo: { id: 2 }
                    },
                    {
                        id: 1005,
                        title: 'Assistante communication',
                        company: 'CGI',
                        status: 'Interview',
                        location: 'Rennes',
                        dateAdded: '2026-07-01T09:00:00.000Z',
                        statusHistory: [
                            { status: 'To Apply', date: '2026-07-01T09:00:00.000Z' },
                            { status: 'Interview', date: '2026-07-20T09:00:00.000Z' }
                        ],
                        interviews: [{ date: '2026-07-28T13:30:00.000Z', type: 'Entretien Visio' }],
                        companyInfo: {
                            id: 5,
                            contacts: [
                                { name: 'Charline Yris', role: 'RH', email: 'charline.yris@cgi.com' },
                                { name: 'Anaëlle Teky', role: 'RH' }
                            ]
                        }
                    },
                    {
                        id: 1006,
                        title: 'Chargée de projet web',
                        company: 'CGI',
                        status: 'No Response',
                        location: 'Rennes',
                        dateAdded: '2026-05-05T09:00:00.000Z',
                        companyDescription: 'ESN internationale',
                        statusHistory: [
                            { status: 'To Apply', date: '2026-05-05T09:00:00.000Z' },
                            { status: 'No Response', date: '2026-06-10T09:00:00.000Z' }
                        ],
                        companyInfo: {
                            id: 5,
                            founded: 1976,
                            // Déjà présente sur l'autre offre : c'est la duplication
                            // que le nouveau modèle supprime.
                            contacts: [{ name: 'Charline Yris', role: 'RH', email: 'charline.yris@cgi.com' }]
                        }
                    }
                ],
                // Tel que le localStorage le rend : les dates y sont des chaînes.
                tasks: [{
                    id: 7001,
                    title: 'Relancer CGI',
                    dueDate: '2026-09-15T09:00:00.000Z' as unknown as Date,
                    completed: false,
                    status: 'a_faire',
                    priority: 'haute'
                }]
            }
        }
    };
}

describe('migrateAppData (v1 → v2)', () => {

    it('conserve le profil et les tâches', () => {
        const user = migrateAppData(legacyData()).users['user_1'];

        expect(user.profile.fullName).toBe('Prénom Nom');
        expect(user.profile.email).toBe('compte@example.com');
        expect(user.tasks.length).toBe(1);
    });

    it('ouvre une campagne qui démarre à la plus ancienne candidature', () => {
        const user = migrateAppData(legacyData()).users['user_1'];

        expect(user.campaigns.length).toBe(1);
        expect(user.campaigns[0].status).toBe('active');
        expect(user.campaigns[0].startedAt).toBe('2026-05-05T09:00:00.000Z');
    });

    it('dédoublonne les entreprises et rassemble leurs informations', () => {
        const user = migrateAppData(legacyData()).users['user_1'];
        const cgi = user.companies.find(company => company.name === 'CGI')!;

        expect(user.companies.length).toBe(3);
        expect(cgi.founded).toBe(1976);
        expect(cgi.description).toBe('ESN internationale');
        expect(user.applications.filter(app => app.companyId === cgi.id).length).toBe(2);
    });

    it('sort les contacts de la fiche entreprise sans les dupliquer', () => {
        const user = migrateAppData(legacyData()).users['user_1'];
        const cgi = user.companies.find(company => company.name === 'CGI')!;
        const charline = user.contacts.filter(contact => contact.fullName === 'Charline Yris');

        expect(user.contacts.length).toBe(2);
        expect(charline.length).toBe(1);
        expect(charline[0].affiliations).toEqual([
            { companyId: cgi.id, current: true, role: 'RH' }
        ]);
    });

    it('rend le statut lisible et daté à partir des événements', () => {
        const user = migrateAppData(legacyData()).users['user_1'];
        const rejected = byTitle(user, "Chargé d'acquisition BtoB & CRM");
        const spontaneous = byTitle(user, 'Candidature spontanée');

        expect(currentStatus(rejected)).toBe('rejected');
        expect(enteredStatusAt(rejected, 'rejected')).toBe('2026-06-18T09:00:00.000Z');
        expect(currentStatus(spontaneous)).toBe('to_apply');
    });

    it('migre les entretiens', () => {
        const user = migrateAppData(legacyData()).users['user_1'];
        const interviewing = byTitle(user, 'Assistante communication');
        const events = interviewEvents(interviewing);

        expect(events.length).toBe(1);
        expect(events[0].interviewKind).toBe('video');
        expect(events[0].at).toBe('2026-07-28T13:30:00.000Z');
    });

    it('déduit la source depuis le lien de l\'annonce', () => {
        const user = migrateAppData(legacyData()).users['user_1'];

        expect(byTitle(user, "Chargé d'acquisition BtoB & CRM").source).toBe('Indeed');
        expect(byTitle(user, 'Candidature spontanée').source).toBeUndefined();
    });

    it('laisse un refus dans son mois d\'origine', () => {
        const user = migrateAppData(legacyData()).users['user_1'];

        const inJune = countEnteredStatus(
            user.applications, 'rejected',
            new Date('2026-06-01T00:00:00.000Z'), new Date('2026-06-30T23:59:59.999Z')
        );
        const inSeptember = countEnteredStatus(
            user.applications, 'rejected',
            new Date('2026-09-01T00:00:00.000Z'), new Date('2026-09-30T23:59:59.999Z')
        );

        expect(inJune).toBe(1);
        expect(inSeptember).toBe(0);
    });

    it('est idempotente : relire un contenu déjà migré ne change rien', () => {
        // On passe par JSON des deux côtés : c'est ce que fait le localStorage,
        // et cela élimine la différence entre « absent » et « undefined ».
        const once = JSON.parse(JSON.stringify(migrateAppData(legacyData())));
        const twice = JSON.parse(JSON.stringify(migrateAppData(once)));

        expect(twice).toEqual(once);
    });

    it('ne perd aucune candidature', () => {
        const legacy = legacyData();
        const user = migrateAppData(legacy).users['user_1'];

        expect(user.applications.map(app => app.title).sort())
            .toEqual(legacy.users['user_1'].offers!.map(offer => offer.title).sort());
    });

    it('renumérote les candidatures sous le compteur d\'identifiants', () => {
        // L'ancien stockage tirait ses identifiants de Date.now() : les garder
        // aurait laissé le compteur en dessous, et une nouvelle candidature
        // aurait pu reprendre un identifiant déjà pris.
        const user = migrateAppData(legacyData()).users['user_1'];

        const ids = [
            ...user.campaigns.map(entry => entry.id),
            ...user.companies.map(entry => entry.id),
            ...user.contacts.map(entry => entry.id),
            ...user.applications.map(entry => entry.id),
            ...user.applications.flatMap(entry => entry.events.map(event => event.id))
        ];

        expect(new Set(ids).size).toBe(ids.length);
        expect(user.nextId).toBeGreaterThan(Math.max(...ids));
    });

    it('accepte un contenu vide ou illisible', () => {
        expect(migrateAppData(null).users).toEqual({});
        expect(migrateAppData({}).users).toEqual({});
        expect(migrateAppData({ users: {} }).currentUserId).toBeNull();
    });
});

describe('sourceFromLink', () => {

    it('reconnaît les jobboards courants', () => {
        expect(sourceFromLink('https://www.hellowork.com/fr-fr/emplois/x.html')).toBe('HelloWork');
        expect(sourceFromLink('https://candidat.francetravail.fr/offres/1')).toBe('France Travail');
        expect(sourceFromLink('https://www.linkedin.com/jobs/view/1')).toBe('LinkedIn');
    });

    it('retombe sur le domaine, et sur rien du tout si le lien est invalide', () => {
        expect(sourceFromLink('https://www.agencewhy.fr/nous-rejoindre')).toBe('agencewhy.fr');
        expect(sourceFromLink('pas un lien')).toBeUndefined();
        expect(sourceFromLink(undefined)).toBeUndefined();
    });
});

function byTitle(user: { applications: { title: string }[] }, title: string) {
    const found = user.applications.find(application => application.title === title);
    if (!found) throw new Error('Aucune candidature intitulée « ' + title + ' »');
    return found as any;
}
