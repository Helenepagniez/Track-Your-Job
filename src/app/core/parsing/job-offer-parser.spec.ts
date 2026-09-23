import { parseJobOffer, parsedFields, sourceFromLink } from './job-offer-parser';

/**
 * Les annonces d'exemple sont inventées, entreprises comprises, mais écrites
 * comme celles des sites d'emploi français : étiquettes, puces, sections.
 */

describe('source du lien', () => {

    it('reconnaît les sites courants', () => {
        expect(sourceFromLink('https://www.hellowork.com/fr-fr/emplois/12345.html')).toBe('HelloWork');
        expect(sourceFromLink('https://candidat.francetravail.fr/offres/recherche/detail/1234')).toBe('France Travail');
        expect(sourceFromLink('https://fr.indeed.com/voir-emploi?jk=abc')).toBe('Indeed');
    });

    it('se rabat sur le domaine pour un site inconnu', () => {
        expect(sourceFromLink('https://www.atelier-verso.fr/nous-rejoindre')).toBe('atelier-verso.fr');
    });

    it('ne devine rien d\'un lien illisible', () => {
        expect(sourceFromLink('pas un lien')).toBeUndefined();
        expect(sourceFromLink(undefined)).toBeUndefined();
    });
});

describe('lien collé seul', () => {

    it('en tire le lien et la source, sans rien inventer', () => {
        const offer = parseJobOffer('  https://www.welcometothejungle.com/fr/companies/verso/jobs/dev  ');

        expect(offer.link).toBe('https://www.welcometothejungle.com/fr/companies/verso/jobs/dev');
        expect(offer.source).toBe('Welcome to the Jungle');
        expect(offer.title).toBeUndefined();
        expect(offer.companyName).toBeUndefined();
    });
});

describe('annonce collée en texte', () => {

    const annonce = `Chargée de communication digitale (H/F)

Atelier Verso recrute pour renforcer son équipe marketing.

Lieu : Rennes (35000)
Type de contrat : CDI
Temps de travail : 35h par semaine
Salaire : entre 32 000 et 36 000 € brut annuel

Missions
- Animer les réseaux sociaux de la marque
- Rédiger la newsletter mensuelle
- Suivre les indicateurs d'audience

Profil recherché
- Formation en communication, 2 ans d'expérience minimum
- Maîtrise de Canva et du référencement naturel

Avantages
- Télétravail 2 jours par semaine
- Tickets restaurant

Processus de recrutement
Un entretien visio, puis une rencontre sur place.`;

    it('reconnaît les champs étiquetés', () => {
        const offer = parseJobOffer(annonce);

        expect(offer.title).toBe('Chargée de communication digitale (H/F)');
        expect(offer.location).toBe('Rennes (35) · télétravail');
        expect(offer.contractType).toBe('CDI');
        expect(offer.weeklyHours).toBe('35h');
        expect(offer.salary).toBe('entre 32 000 et 36 000 € brut annuel');
    });

    it('trouve l\'entreprise dans « X recrute »', () => {
        expect(parseJobOffer(annonce).companyName).toBe('Atelier Verso');
        expect(parseJobOffer(annonce).employerNotNamed).toBeUndefined();
    });

    it('ne recopie pas dans la description ce qui a son propre champ', () => {
        const posting = parseJobOffer(annonce).posting!;

        expect(posting.description).toContain('renforcer son équipe marketing');
        expect(posting.description).not.toContain('Type de contrat');
        expect(posting.description).not.toContain('35h par semaine');
        expect(posting.description).not.toContain('36 000');
    });

    it('range chaque section à sa place', () => {
        const posting = parseJobOffer(annonce).posting!;

        expect(posting.missions).toContain('Animer les réseaux sociaux');
        expect(posting.missions).toContain('newsletter');
        expect(posting.missions).not.toContain('Canva');
        expect(posting.profile).toContain('Canva');
        expect(posting.benefits).toContain('Tickets restaurant');
        expect(posting.recruitmentProcess).toContain('entretien visio');
    });

    it('dit ce qu\'il a reconnu', () => {
        const fields = parsedFields(parseJobOffer(annonce));

        expect(fields).toContain('intitulé');
        expect(fields).toContain('entreprise');
        expect(fields).toContain('salaire');
        expect(fields).toContain('missions');
        expect(fields).not.toContain('lien');
    });
});

describe('annonce d\'agence sans employeur nommé', () => {

    const annonce = `Assistant administratif (H/F)

Interim Plus recherche pour notre client, acteur du bâtiment, un assistant administratif.

Poste basé à Cesson-Sévigné
Contrat : mission d'intérim de 6 mois
Rémunération : 13,50 € brut / heure`;

    it('ne fabrique pas de nom d\'entreprise', () => {
        const offer = parseJobOffer(annonce);

        expect(offer.employerNotNamed).toBeTrue();
        expect(offer.companyName).toBeUndefined();
        expect(offer.agencyName).toBe('Interim Plus');
    });

    it('lit le contrat, sa durée et le taux horaire', () => {
        const offer = parseJobOffer(annonce);

        expect(offer.contractType).toBe('Intérim');
        expect(offer.contractDuration).toBe('6 mois');
        expect(offer.salary).toContain('13,50 €');
    });

    it('trouve la ville dans « basé à … », sans code postal', () => {
        expect(parseJobOffer(annonce).location).toBe('Cesson-Sévigné');
        expect(parseJobOffer('Poste à pourvoir à Nantes dès septembre.').location).toBe('Nantes');
    });
});

describe('page avec un JobPosting en JSON-LD', () => {

    const page = `<!doctype html><html><head>
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "JobPosting",
      "title": "Community manager",
      "url": "https://www.hellowork.com/fr-fr/emplois/98765.html",
      "employmentType": ["CDD", "FULL_TIME"],
      "hiringOrganization": { "@type": "Organization", "name": "Groupe Lumen" },
      "jobLocation": {
        "@type": "Place",
        "address": { "@type": "PostalAddress", "addressLocality": "Nantes", "postalCode": "44000" }
      },
      "baseSalary": {
        "@type": "MonetaryAmount",
        "currency": "EUR",
        "value": { "@type": "QuantitativeValue", "minValue": 30000, "maxValue": 34000, "unitText": "YEAR" }
      },
      "description": "<p>Missions</p><ul><li>Piloter le calendrier éditorial</li></ul><p>Profil</p><ul><li>Deux ans d'expérience</li></ul>"
    }
    </script></head><body>Contenu de la page</body></html>`;

    it('préfère ce que le site déclare lui-même', () => {
        const offer = parseJobOffer(page);

        expect(offer.title).toBe('Community manager');
        expect(offer.companyName).toBe('Groupe Lumen');
        expect(offer.location).toBe('Nantes (44)');
        expect(offer.contractType).toBe('CDD');
        expect(offer.weeklyHours).toBe('Temps plein');
        expect(offer.salary).toBe('30 000 à 34 000 € brut / an');
        expect(offer.source).toBe('HelloWork');
    });

    it('découpe aussi la description en sections', () => {
        const posting = parseJobOffer(page).posting!;

        expect(posting.missions).toContain('calendrier éditorial');
        expect(posting.profile).toContain('Deux ans');
    });
});

describe('cas limites', () => {

    it('ne renvoie rien sur une entrée vide', () => {
        expect(parseJobOffer('')).toEqual({});
        expect(parseJobOffer('   ')).toEqual({});
        expect(parsedFields({})).toEqual([]);
    });

    it('ne s\'étrangle pas sur un JSON-LD cassé', () => {
        const page = '<script type="application/ld+json">{ ceci n\'est pas du json </script>Assistante de direction';
        expect(() => parseJobOffer(page)).not.toThrow();
    });

    it('accepte un JSON-LD rangé dans un tableau', () => {
        const page = `<script type="application/ld+json">
        [{ "@type": "BreadcrumbList" }, { "@type": "JobPosting", "title": "Graphiste" }]
        </script>`;
        expect(parseJobOffer(page).title).toBe('Graphiste');
    });

    it('ne prend pas un texte quelconque pour une annonce', () => {
        const offer = parseJobOffer('Bonjour, merci pour votre candidature.');

        expect(offer.companyName).toBeUndefined();
        expect(offer.salary).toBeUndefined();
        expect(offer.posting).toBeUndefined();
    });
});
