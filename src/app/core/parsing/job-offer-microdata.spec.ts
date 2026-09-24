import { parseJobOffer } from './job-offer-parser';

/**
 * Les sites publics décrivent souvent leurs offres en microdonnées
 * schema.org : des attributs `itemprop` sur les balises, avec la valeur dans
 * un attribut `content` plutôt que dans le texte visible. C'est ce qui donne
 * l'employeur, le salaire, l'expérience demandée et les compétences —
 * qu'aucune règle de lecture ne devinerait aussi bien.
 *
 * Structure reprise d'une vraie page France Travail ; l'annonce est inventée.
 */
function pageMicrodonnees(): string {
    return `<html><body><main itemtype="http://schema.org/JobPosting" itemscope="">
    <h1><span itemprop="title">Secrétaire médicale (H/F)</span></h1>

    <p itemtype="http://schema.org/Place" itemprop="jobLocation" itemscope="">
        <span itemtype="http://schema.org/PostalAddress" itemscope="" itemprop="address">
            <span content="35000" itemprop="postalCode"></span>
            <span content="Rennes" itemprop="addressLocality"></span>
        </span>
    </p>

    <span content="FULL_TIME" itemprop="employmentType"></span>
    <dd itemprop="workHours"> 35H/semaine Travail en journée</dd>

    <span itemtype="http://schema.org/MonetaryAmount" itemscope="" itemprop="baseSalary">
        <span content="EUR" itemprop="currency"></span>
        <span itemtype="http://schema.org/QuantitativeValue" itemscope="" itemprop="value">
            <span content="1868.0" itemprop="minValue"></span>
            <span content="2500.0" itemprop="maxValue"></span>
            <span content="MONTH" itemprop="unitText"></span>
        </span>
    </span>

    <span itemtype="http://schema.org/Organization" itemscope="" itemprop="hiringOrganization">
        <span content="CLINIQUE VERSO BEAULIEU" itemprop="name"></span>
    </span>

    <ul>
        <li><span itemprop="experienceRequirements">1 An(s)</span></li>
        <li><span itemprop="qualifications">Employé qualifié</span></li>
        <li><span itemprop="skills">Accueillir, orienter et renseigner un patient</span></li>
        <li><span itemprop="skills">Actualiser le dossier médical du patient</span></li>
        <li>Secteur : <span itemprop="industry">Activités hospitalières</span></li>
    </ul>

    <div itemprop="description">
        <p>La Clinique Verso Beaulieu est un établissement de soins de suite.</p>
        <p>Conditions de travail :</p>
        <p>- Contrat à durée déterminée<br>- Du lundi au vendredi</p>
        <p>Missions :</p>
        <p>Gestion des consultations des patients.<br>Accueil téléphonique.</p>
        <p>Rémunération :</p>
        <p>- Prime décentralisée de 5%<br>- Nombreux avantages extraconventionnels Compétences requises :</p>
        <p>- BAC Professionnel Secrétariat<br>- Maîtrise du pack office</p>
    </div>
    </main></body></html>`;
}

describe('microdonnées schema.org', () => {

    it('lit l\'employeur, même quand la valeur est dans un attribut', () => {
        const offer = parseJobOffer(pageMicrodonnees());

        // Le texte visible est vide : seule la microdonnée porte le nom.
        expect(offer.companyName).toBe('Clinique Verso Beaulieu');
    });

    it('assemble le salaire déclaré', () => {
        expect(parseJobOffer(pageMicrodonnees()).salary).toBe('1 868 à 2 500 € brut / mois');
    });

    it('préfère les horaires déclarés au simple « temps plein »', () => {
        expect(parseJobOffer(pageMicrodonnees()).weeklyHours).toBe('35h');
    });

    it('lit le lieu et l\'intitulé', () => {
        const offer = parseJobOffer(pageMicrodonnees());

        expect(offer.title).toBe('Secrétaire médicale (H/F)');
        expect(offer.location).toBe('Rennes (35)');
    });

    it('compose le profil recherché avec l\'expérience et les compétences', () => {
        const profile = parseJobOffer(pageMicrodonnees()).posting!.profile!;

        expect(profile).toContain('Expérience : 1 An(s)');
        expect(profile).toContain('Qualification : Employé qualifié');
        expect(profile).toContain('- Accueillir, orienter et renseigner un patient');
        expect(profile).toContain('- Actualiser le dossier médical du patient');
    });

    it('range le secteur d\'activité dans « autres »', () => {
        expect(parseJobOffer(pageMicrodonnees()).posting!.others)
            .toContain('Secteur d\'activité : Activités hospitalières');
    });
});

describe('sections du texte de l\'annonce', () => {

    it('sépare conditions, missions, avantages et profil', () => {
        const posting = parseJobOffer(pageMicrodonnees()).posting!;

        expect(posting.description).toContain('Contrat à durée déterminée');
        expect(posting.missions).toContain('Gestion des consultations');
        expect(posting.benefits).toContain('Prime décentralisée');
        expect(posting.profile).toContain('BAC Professionnel');
    });

    it('ne laisse pas les missions avaler le reste', () => {
        const posting = parseJobOffer(pageMicrodonnees()).posting!;

        expect(posting.missions).not.toContain('Prime décentralisée');
        expect(posting.missions).not.toContain('BAC Professionnel');
        expect(posting.benefits).not.toContain('BAC Professionnel');
    });

    it('reconnaît un titre de section collé à la fin d\'une ligne', () => {
        // « - Nombreux avantages extraconventionnels Compétences requises : »
        const posting = parseJobOffer(pageMicrodonnees()).posting!;

        expect(posting.benefits).toContain('Nombreux avantages extraconventionnels');
        expect(posting.benefits).not.toContain('Compétences requises');
        expect(posting.profile).toContain('BAC Professionnel');
    });
});

describe('pièges du HTML moderne', () => {

    it('ne laisse pas passer du code quand un attribut contient un chevron', () => {
        // `data-action="click->menu#toggle"` est courant : un retrait de
        // balises naïf s'arrête au chevron de l'attribut et laisse filer le
        // reste, noms de classes CSS compris.
        const page = `<html><body><main>
            <h2>Les missions du poste</h2>
            <div data-action="click->toggle-on-body#remove" class="h-full w-full bg-black">
                <p>Gestion du planning des consultations.</p>
            </div>
            </main></body></html>`;

        const posting = parseJobOffer(page).posting!;
        const whole = JSON.stringify(posting);

        expect(posting.missions).toContain('Gestion du planning');
        expect(whole).not.toContain('bg-black');
        expect(whole).not.toContain('toggle-on-body');
    });

    it('traite un titre inconnu comme une frontière, et le garde', () => {
        const page = `<html><body><main>
            <h2>Les avantages</h2>
            <p>Mutuelle et titres restaurant.</p>
            <h2>Bienvenue chez Studio Lumen</h2>
            <p>Studio fondé en 2015, quinze personnes.</p>
            </main></body></html>`;

        const posting = parseJobOffer(page).posting!;

        expect(posting.benefits).toContain('Mutuelle');
        expect(posting.benefits).not.toContain('fondé en 2015');
        expect(posting.others).toContain('Bienvenue chez Studio Lumen');
        expect(posting.others).toContain('fondé en 2015');
    });

    it('ne laisse pas la marque de titre dans les champs', () => {
        const page = '<html><body><main><h1>Chargée de communication (H/F)</h1>'
            + '<p>Studio Lumen recrute à Brest, en CDI, pour une prise de poste rapide.</p>'
            + '</main></body></html>';

        const offer = parseJobOffer(page);

        expect(offer.title).toBe('Chargée de communication (H/F)');
        expect(JSON.stringify(offer)).not.toContain('§§');
    });
});
