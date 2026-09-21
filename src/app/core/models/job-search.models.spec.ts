import {
    Application,
    ApplicationStatus,
    computeCampaignStats,
    countAnsweredIn,
    countEnteredStatus,
    countSentIn,
    currentStatus,
    median,
    Profile,
    profileChecklist,
    profileCompletion,
    responseDelayDays,
    statusAt
} from './job-search.models';

let nextEventId = 1;

/** Construit une candidature à partir de sa suite de statuts datés. */
function build(
    id: number,
    steps: [ApplicationStatus, string][],
    source?: string
): Application {
    const createdAt = steps[0]?.[1] ?? '2026-01-01T09:00:00.000Z';
    return {
        id,
        campaignId: 1,
        companyId: null,
        title: `Candidature ${id}`,
        createdAt,
        contactIds: [],
        source,
        events: [
            { id: nextEventId++, type: 'created', at: createdAt },
            ...steps.map(([status, at]) => ({
                id: nextEventId++,
                type: 'status' as const,
                at,
                status
            }))
        ]
    };
}

const JUNE = { from: new Date('2026-06-01T00:00:00.000Z'), to: new Date('2026-06-30T23:59:59.999Z') };
const SEPT = { from: new Date('2026-09-01T00:00:00.000Z'), to: new Date('2026-09-30T23:59:59.999Z') };

describe('lecture du statut', () => {

    it('prend le dernier événement en date', () => {
        const application = build(1, [
            ['to_apply', '2026-06-01T09:00:00.000Z'],
            ['sent', '2026-06-02T09:00:00.000Z'],
            ['rejected', '2026-06-18T09:00:00.000Z']
        ]);

        expect(currentStatus(application)).toBe('rejected');
    });

    it('sait dire où en était une candidature à une date passée', () => {
        const application = build(1, [
            ['to_apply', '2026-06-01T09:00:00.000Z'],
            ['sent', '2026-06-02T09:00:00.000Z'],
            ['rejected', '2026-06-18T09:00:00.000Z']
        ]);

        expect(statusAt(application, new Date('2026-06-10T00:00:00.000Z'))).toBe('sent');
        expect(statusAt(application, new Date('2026-05-01T00:00:00.000Z'))).toBeNull();
    });
});

describe('comptages par période', () => {

    const applications = [
        build(1, [['to_apply', '2026-06-01T09:00:00.000Z'], ['sent', '2026-06-02T09:00:00.000Z'], ['rejected', '2026-06-18T09:00:00.000Z']]),
        build(2, [['to_apply', '2026-09-01T09:00:00.000Z'], ['sent', '2026-09-02T09:00:00.000Z'], ['interview', '2026-09-16T09:00:00.000Z']]),
        build(3, [['to_apply', '2026-09-05T09:00:00.000Z']])
    ];

    it('laisse un refus dans son mois, quoi qu\'il arrive ensuite', () => {
        expect(countEnteredStatus(applications, 'rejected', JUNE.from, JUNE.to)).toBe(1);
        expect(countEnteredStatus(applications, 'rejected', SEPT.from, SEPT.to)).toBe(0);
    });

    it('compte les envois au mois de leur départ', () => {
        expect(countSentIn(applications, JUNE.from, JUNE.to)).toBe(1);
        expect(countSentIn(applications, SEPT.from, SEPT.to)).toBe(1);
    });

    it('compte les réponses au mois où elles arrivent', () => {
        expect(countAnsweredIn(applications, JUNE.from, JUNE.to)).toBe(1);
        expect(countAnsweredIn(applications, SEPT.from, SEPT.to)).toBe(1);
    });
});

describe('computeCampaignStats', () => {

    const applications = [
        // Envoyée puis refusée : reste un envoi.
        build(1, [['to_apply', '2026-06-01T09:00:00.000Z'], ['sent', '2026-06-02T09:00:00.000Z'], ['rejected', '2026-06-12T09:00:00.000Z']], 'Indeed'),
        // Envoyée, relancée, puis réponse : la relance a débloqué.
        build(2, [['to_apply', '2026-06-05T09:00:00.000Z'], ['sent', '2026-06-06T09:00:00.000Z'], ['to_relaunch', '2026-06-20T09:00:00.000Z'], ['interview', '2026-06-26T09:00:00.000Z']], 'Réseau'),
        // Envoyée, relancée, toujours rien.
        build(3, [['to_apply', '2026-06-07T09:00:00.000Z'], ['sent', '2026-06-08T09:00:00.000Z'], ['to_relaunch', '2026-06-22T09:00:00.000Z'], ['no_response', '2026-07-13T09:00:00.000Z']], 'Indeed'),
        // Jamais envoyée.
        build(4, [['to_apply', '2026-06-09T09:00:00.000Z']], 'Indeed'),
        // Offre obtenue.
        build(5, [['to_apply', '2026-06-10T09:00:00.000Z'], ['sent', '2026-06-11T09:00:00.000Z'], ['interview', '2026-06-18T09:00:00.000Z'], ['offer', '2026-06-30T09:00:00.000Z']], 'Réseau')
    ];

    const stats = computeCampaignStats(applications, '2026-06-01T00:00:00.000Z', '2026-07-31T00:00:00.000Z');

    it('compte les candidatures repérées et celles réellement parties', () => {
        expect(stats.applications).toBe(5);
        expect(stats.sent).toBe(4);
    });

    it('compte une candidature refusée parmi les envois', () => {
        // Sans cela, un refus effacerait l'envoi qui l'a précédé.
        expect(stats.rejected).toBe(1);
        expect(stats.sent).toBeGreaterThanOrEqual(stats.rejected);
    });

    it('compte les réponses, entretiens et offres sur tout le parcours', () => {
        expect(stats.answered).toBe(3);
        expect(stats.interviews).toBe(2);
        expect(stats.offers).toBe(1);
        expect(stats.noResponse).toBe(1);
    });

    it('ne compte une relance comme utile que si la réponse vient après', () => {
        expect(stats.relaunched).toBe(2);
        expect(stats.relaunchesAnswered).toBe(1);
    });

    it('classe les sources par taux de réponse, pas par volume', () => {
        expect(stats.bySource.map(entry => entry.source)).toEqual(['Réseau', 'Indeed']);
        expect(stats.bySource[0]).toEqual({ source: 'Réseau', sent: 2, answered: 2 });
        // La candidature jamais envoyée ne pèse pas sur le rendement d'Indeed.
        expect(stats.bySource[1]).toEqual({ source: 'Indeed', sent: 2, answered: 1 });
    });

    it('donne un délai de réponse médian en jours', () => {
        // Délais : 10 j (id 1), 20 j (id 2), 7 j (id 5).
        expect(stats.medianResponseDays).toBe(10);
    });

    it('accepte une campagne vide', () => {
        const empty = computeCampaignStats([], '2026-06-01T00:00:00.000Z', '2026-06-30T00:00:00.000Z');

        expect(empty.applications).toBe(0);
        expect(empty.sent).toBe(0);
        expect(empty.bySource).toEqual([]);
        expect(empty.medianResponseDays).toBeNull();
    });
});

describe('complétion du profil', () => {

    const base: Profile = {
        id: 'u1',
        fullName: 'Démo Track',
        email: 'demo@example.test',
        password: 'x',
        authMethod: 'email',
        createdAt: '2026-05-01T08:00:00.000Z'
    };

    it('part de zéro sur un profil vide, et ne compte pas le nom', () => {
        expect(profileCompletion(profileChecklist(base))).toBe(0);
        expect(profileCompletion(profileChecklist(null))).toBe(0);
    });

    it('exige trois compétences, pas une', () => {
        const withOne = profileChecklist({ ...base, skills: ['SEO'] });
        const withThree = profileChecklist({ ...base, skills: ['SEO', 'Rédaction', 'Canva'] });

        expect(withOne.find(item => item.key === 'skills')!.done).toBeFalse();
        expect(withThree.find(item => item.key === 'skills')!.done).toBeTrue();
    });

    it('accepte LinkedIn ou le portfolio, l\'un ou l\'autre', () => {
        const linkedin = profileChecklist({ ...base, linkedin: 'https://linkedin.com/in/x' });
        const portfolio = profileChecklist({ ...base, portfolio: 'https://demo.fr' });

        expect(linkedin.find(item => item.key === 'links')!.done).toBeTrue();
        expect(portfolio.find(item => item.key === 'links')!.done).toBeTrue();
    });

    it('ignore les champs remplis d\'espaces', () => {
        const items = profileChecklist({ ...base, title: '   ', location: 'Rennes' });

        expect(items.find(item => item.key === 'title')!.done).toBeFalse();
        expect(items.find(item => item.key === 'location')!.done).toBeTrue();
    });

    it('atteint 100 % quand tout est renseigné', () => {
        const complete: Profile = {
            ...base,
            title: 'Chargée de communication',
            location: 'Rennes',
            phone: '0612345678',
            searchZone: 'Rennes + 50 km',
            targetRoles: ['Communication'],
            contractTypes: ['CDI'],
            skills: ['SEO', 'Rédaction', 'Canva'],
            salaryExpectation: '34 000 €',
            availability: 'Immédiatement',
            linkedin: 'https://linkedin.com/in/x',
            documents: [{ id: 1, label: 'CV', fileName: 'cv.pdf', kind: 'cv', addedAt: base.createdAt }]
        };

        expect(profileCompletion(profileChecklist(complete))).toBe(100);
    });
});

describe('utilitaires', () => {

    it('calcule un délai de réponse, et rien si l\'entreprise n\'a pas répondu', () => {
        const answered = build(1, [['to_apply', '2026-06-01T09:00:00.000Z'], ['sent', '2026-06-02T09:00:00.000Z'], ['rejected', '2026-06-12T09:00:00.000Z']]);
        const silent = build(2, [['to_apply', '2026-06-01T09:00:00.000Z'], ['sent', '2026-06-02T09:00:00.000Z']]);

        expect(responseDelayDays(answered)).toBe(10);
        expect(responseDelayDays(silent)).toBeNull();
    });

    it('calcule une médiane sur un nombre pair et impair de valeurs', () => {
        expect(median([5])).toBe(5);
        expect(median([1, 3, 10])).toBe(3);
        expect(median([2, 4, 6, 10])).toBe(5);
        expect(median([])).toBeNull();
    });
});
