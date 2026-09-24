import { locationLabel, mapOffer, mapOffers, searchParams } from './france-travail';

/**
 * Charge utile reprise de la forme réelle de l'API « Offres d'emploi v2 » de
 * France Travail ; l'annonce est inventée.
 */
function offreApi(): Record<string, unknown> {
    return {
        id: '214GCJM',
        intitule: 'Secrétaire médicale MPR CDD (H/F)',
        description: 'La Clinique Verso est un établissement de soins de suite. '
            + 'Le poste est rattaché au médecin chef de service. '
            + 'Conditions de travail : contrat à durée déterminée à pourvoir dès que possible, '
            + 'temps plein, du lundi au vendredi, dans une équipe de huit personnes.',
        dateCreation: '2026-09-22T08:14:00.000Z',
        lieuTravail: { libelle: '35 - RENNES', codePostal: '35000', commune: '35238' },
        typeContrat: 'CDD',
        typeContratLibelle: 'Contrat à durée déterminée - 12 Mois',
        natureContrat: 'Contrat travail',
        experienceLibelle: '1 An(s)',
        salaire: { libelle: 'Mensuel de 1868.0 Euros à 2500.0 Euros' },
        dureeTravailLibelle: '35H/semaine',
        dureeTravailLibelleConverti: 'Temps plein',
        alternance: false,
        entreprise: { nom: 'CLINIQUE VERSO BEAULIEU', description: 'Établissement de santé' },
        origineOffre: {
            urlOrigine: 'https://candidat.francetravail.fr/offres/recherche/detail/214GCJM'
        },
        competences: [
            { code: '1', libelle: 'Accueillir, orienter et renseigner un patient' },
            { code: '2', libelle: 'Actualiser le dossier médical du patient' }
        ],
        secteurActiviteLibelle: 'Activités hospitalières',
        qualificationLibelle: 'Employé qualifié'
    };
}

describe('offre France Travail', () => {

    it('reprend les champs utiles', () => {
        const offer = mapOffer(offreApi())!;

        expect(offer.id).toBe('214GCJM');
        expect(offer.title).toBe('Secrétaire médicale MPR CDD (H/F)');
        expect(offer.contractType).toBe('CDD');
        expect(offer.contractLabel).toBe('Contrat à durée déterminée - 12 Mois');
        expect(offer.weeklyHours).toBe('35H/semaine');
        expect(offer.salary).toBe('Mensuel de 1868.0 Euros à 2500.0 Euros');
        expect(offer.experience).toBe('1 An(s)');
        expect(offer.publishedAt).toBe('2026-09-22T08:14:00.000Z');
        expect(offer.link).toContain('/detail/214GCJM');
        expect(offer.sector).toBe('Activités hospitalières');
        expect(offer.skills).toEqual([
            'Accueillir, orienter et renseigner un patient',
            'Actualiser le dossier médical du patient'
        ]);
    });

    it('remet les capitales en casse normale, sigles préservés', () => {
        expect(mapOffer(offreApi())!.company).toBe('Clinique Verso Beaulieu');
        expect(locationLabel('35 - RENNES')).toBe('Rennes (35)');
        expect(locationLabel('35 - SAINT-MALO')).toBe('Saint-Malo (35)');
        expect(locationLabel('75 - PARIS 09')).toBe('Paris 09 (75)');
    });

    it('écrit les communes en plusieurs mots comme on les écrit', () => {
        // Relevé sur de vraies offres : « BAIN DE BRETAGNE », « ST GREGOIRE ».
        // Les mots courts d'une commune ne sont pas des sigles.
        expect(locationLabel('35 - BAIN DE BRETAGNE')).toBe('Bain de Bretagne (35)');
        expect(locationLabel('35 - ST GREGOIRE')).toBe('St Gregoire (35)');
        expect(locationLabel('44 - L\'HERMITAGE')).toBe('L\'Hermitage (44)');
        expect(locationLabel('56 - SAINT-AVE')).toBe('Saint-Ave (56)');
    });

    it('garde le libellé tel quel quand il ne suit pas le format', () => {
        expect(locationLabel('Rennes et alentours')).toBe('Rennes et alentours');
    });

    it('traduit les codes de contrat de l\'API', () => {
        const interim = { ...offreApi(), typeContrat: 'MIS' };
        expect(mapOffer(interim)!.contractType).toBe('Intérim');

        const inconnu = { ...offreApi(), typeContrat: 'ZZZ' };
        expect(mapOffer(inconnu)!.contractType).toBe('ZZZ');
    });

    it('reconnaît une alternance', () => {
        const offer = mapOffer({ ...offreApi(), alternance: true })!;

        expect(offer.alternance).toBeTrue();
        expect(offer.contractType).toBe('Alternance');
    });

    it('coupe un extrait lisible pour la liste', () => {
        const offer = mapOffer(offreApi())!;

        expect(offer.excerpt!.length).toBeLessThanOrEqual(221);
        expect(offer.excerpt).toContain('Clinique Verso');
        expect(offer.description!.length).toBeGreaterThan(offer.excerpt!.length);
    });

    it('laisse tomber une offre sans identifiant ni intitulé', () => {
        expect(mapOffer({ intitule: 'Sans identifiant' })).toBeNull();
        expect(mapOffer({ id: '123' })).toBeNull();
    });

    it('ne renvoie pas d\'entreprise quand l\'employeur n\'est pas nommé', () => {
        const anonyme = { ...offreApi(), entreprise: { description: 'Cabinet de recrutement' } };
        expect(mapOffer(anonyme)!.company).toBeUndefined();
    });

    it('lit une réponse complète, et supporte une réponse vide', () => {
        expect(mapOffers({ resultats: [offreApi(), { id: '2', intitule: 'Graphiste' }] }).length).toBe(2);
        expect(mapOffers({ resultats: [] })).toEqual([]);
        expect(mapOffers({})).toEqual([]);
        expect(mapOffers(null)).toEqual([]);
    });
});

describe('paramètres de recherche', () => {

    it('traduit les critères en paramètres d\'API', () => {
        const params = searchParams({
            keywords: 'secrétaire médicale',
            department: '35',
            contractTypes: ['CDI', 'CDD'],
            publishedWithinDays: 7,
            limit: 20
        });

        expect(params['motsCles']).toBe('secrétaire médicale');
        expect(params['departement']).toBe('35');
        expect(params['typeContrat']).toBe('CDI,CDD');
        expect(params['publieeDepuis']).toBe('7');
        expect(params['range']).toBe('0-19');
    });

    it('préfère la commune et son rayon quand ils sont donnés', () => {
        const params = searchParams({ commune: '35238', distance: 20, department: '35' });

        expect(params['commune']).toBe('35238');
        expect(params['distance']).toBe('20');
        expect(params['departement']).toBeUndefined();
    });

    it('ramène « publiée depuis » à une valeur acceptée par l\'API', () => {
        expect(searchParams({ publishedWithinDays: 5 })['publieeDepuis']).toBe('3');
        expect(searchParams({ publishedWithinDays: 30 })['publieeDepuis']).toBe('31');
        expect(searchParams({ publishedWithinDays: 2 })['publieeDepuis']).toBe('1');
    });

    it('pagine par plages, sans dépasser la limite de l\'API', () => {
        expect(searchParams({ from: 20, limit: 20 })['range']).toBe('20-39');
        expect(searchParams({ limit: 500 })['range']).toBe('0-49');
    });

    it('ne met aucun filtre quand rien n\'est demandé', () => {
        const params = searchParams({});

        expect(params['motsCles']).toBeUndefined();
        expect(params['typeContrat']).toBeUndefined();
        expect(Object.keys(params)).toEqual(['range']);
    });
});
