import { extractMainContent, parseJobOffer } from './job-offer-parser';

/**
 * Cas observé en vrai : la fonction serveur récupère la page entière d'un
 * site d'emploi, pas seulement l'annonce. On y trouve la navigation, le pied
 * de page, des fenêtres d'aide, et surtout d'autres annonces — autant de
 * pièges pour des règles de lecture.
 *
 * La page ci-dessous est une maquette de cette structure : les libellés
 * d'interface sont ceux qu'on rencontre, les annonces sont inventées.
 */
function pageAvecHabillage(): string {
    return `<!doctype html>
<html lang="fr">
<head><title>Secrétaire médical (H/F) - Offre d'emploi</title></head>
<body>
    <header class="site-header">
        <nav role="navigation"><a href="/">Accueil</a><a href="/offres">Offres d'emploi</a></nav>
    </header>

    <main>
        <h1>Secrétaire médical (H/F)</h1>
        <p>Cabinet Verso Santé - 35 - Rennes</p>
        <p>Type de contrat : CDD</p>
        <p>Durée : 6 mois</p>
        <p>Temps de travail : 35h par semaine</p>

        <h2>Missions</h2>
        <p>Votre mission consiste à oeuvrer en collaboration avec les médecins à la gestion
        des consultations des patients.</p>

        <h2>Profil recherché</h2>
        <p>Première expérience en secrétariat médical appréciée.</p>
    </main>

    <aside class="autres-offres">
        <h2>Offres similaires</h2>
        <article>
            <h3>Secrétaire de scolarité (H/F)</h3>
            <p>Institut Lumen - 44 - Nantes</p>
            <p>CDI</p>
            <p>Non renseigné</p>
            <p>Publié il y a 8 jours</p>
            <p>- (déjà vu)</p>
        </article>
        <button type="button">Afficher plus d'offres</button>
    </aside>

    <div class="modal" role="dialog" aria-modal="true">
        <button type="button">×Fermer la fenêtre Besoin d'aide sur la recherche d'offres d'emploi ?</button>
        <p>Besoin d'aide sur la recherche d'offres d'emploi ?</p>
        <p>Dans l'exemple ci-dessus, si vous sélectionnez « CDI (941) » seules les offres
        d'emploi en CDI vous seront restituées.</p>
        <p>Vous pouvez y associer un rayon de recherche compris entre 0 et 100 km.</p>
    </div>

    <div class="popin-partenaire">
        <p>×Fermer la fenêtre "Offres partenaires"Offres partenaires</p>
    </div>

    <footer class="site-footer">
        <p>Mentions légales</p><p>Cookies</p>
    </footer>
</body>
</html>`;
}

describe('page complète d\'un site d\'emploi', () => {

    it('ne garde que le contenu principal', () => {
        const content = extractMainContent(pageAvecHabillage());

        expect(content).toContain('gestion');
        expect(content).not.toContain('Fermer la fenêtre');
        expect(content).not.toContain('Offres similaires');
        expect(content).not.toContain('Mentions légales');
        expect(content).not.toContain('Accueil');
    });

    it('lit l\'annonce, et rien de ce qui l\'entoure', () => {
        const offer = parseJobOffer(pageAvecHabillage());

        expect(offer.title).toBe('Secrétaire médical (H/F)');
        expect(offer.location).toBe('Rennes (35)');
        expect(offer.contractType).toBe('CDD');
        expect(offer.contractDuration).toBe('6 mois');
        expect(offer.weeklyHours).toBe('35h');
    });

    it('ne prend pas « CDI (941) » du texte d\'aide pour un lieu', () => {
        // Le nombre entre parenthèses doit être un département ou un code
        // postal, et le mot qui précède doit pouvoir être une ville.
        expect(parseJobOffer(pageAvecHabillage()).location).not.toContain('CDI');
        expect(parseJobOffer('Filtre CDI (941) appliqué').location).toBeUndefined();
    });

    it('ne prend pas un bouton pour un nom d\'entreprise', () => {
        const offer = parseJobOffer(pageAvecHabillage());

        expect(offer.companyName ?? '').not.toContain('Fermer');
        expect(offer.companyName ?? '').not.toContain('Besoin d\'aide');
    });

    it('ne laisse pas l\'habillage entrer dans les sections', () => {
        const posting = parseJobOffer(pageAvecHabillage()).posting!;
        const whole = Object.values(posting).join('\n');

        expect(posting.missions).toContain('consultations des patients');
        expect(whole).not.toContain('Publié il y a');
        expect(whole).not.toContain('déjà vu');
        expect(whole).not.toContain('Non renseigné');
        expect(whole).not.toContain('rayon de recherche');
    });

    it('retient le contrat cité par l\'annonce, pas celui d\'à côté', () => {
        // L'annonce est un CDD ; la page nomme aussi des CDI ailleurs.
        const offer = parseJobOffer(pageAvecHabillage());
        expect(offer.contractType).toBe('CDD');
    });

    it('prend le premier contrat cité quand il n\'y a pas d\'étiquette', () => {
        expect(parseJobOffer('Mission en CDD de 4 mois, ou CDI ensuite.').contractType).toBe('CDD');
        expect(parseJobOffer('Poste en CDI, après une période en CDD.').contractType).toBe('CDI');
    });

    it('écarte l\'habillage même sans structure HTML', () => {
        // Cas vécu : le texte d'une page de résultats, collé tel quel. Il n'y
        // a plus de balises pour isoler l'annonce, seulement les tournures de
        // l'interface. L'introduction doit s'arrêter au premier morceau
        // d'interface rencontré.
        const texte = [
            'Un cabinet de cardiologie cherche un CDD pour un remplacement en temps plein 35h/ semaine.',
            'Les...',
            'CDD',
            '- Non renseigné',
            'Publié il y a 18 jours',
            '- (déjà vu)',
            'Institut Lumen',
            '- 35 - Rennes',
            'Afficher plus d\'offres',
            '×Fermer la fenêtre Besoin d\'aide sur la recherche d\'offres d\'emploi ?',
            'Dans l\'exemple ci-dessus, si vous sélectionnez « CDI (941) » seules les offres en CDI vous seront restituées.',
            'Vous pouvez y associer un rayon de recherche compris entre 0 et 100 km.'
        ].join('\n');

        const offer = parseJobOffer(texte);
        const whole = JSON.stringify(offer);

        expect(offer.companyName).toBeUndefined();
        expect(offer.location).toBe('Rennes (35)');
        expect(offer.contractType).toBe('CDD');
        expect(offer.title).not.toBe('Les...');
        expect(whole).not.toContain('CDI (94');
        expect(whole).not.toContain('rayon de recherche');
        expect(whole).not.toContain('Publié il y a');
        expect(whole).not.toContain('Non renseigné');
    });

    it('ne prend pas une adresse technique de la page pour le lien', () => {
        // Relevé sur une vraie page : un espace de noms XML dans la balise
        // racine, et une adresse de mesure d'audience. Ni l'un ni l'autre
        // n'est l'annonce.
        const page = `<html xmlns="http://tapestry.apache.org/schema/tapestry_5_4.xsd">
            <body><div><h1>Assistant de gestion (H/F)</h1>
            <p>Poste en CDI à Vannes.</p>
            <img src="https://cdn.exemple.fr/logo.png">
            <span>https://bf95196pdg.bf.dynatrace.com/bf|rid=RID_-1930</span>
            </div></body></html>`;

        const offer = parseJobOffer(page);

        expect(offer.link).toBeUndefined();
        expect(offer.source).toBeUndefined();
        expect(offer.title).toBe('Assistant de gestion (H/F)');
    });

    it('préfère le lien que la page déclare comme le sien', () => {
        const page = `<html><head>
            <link rel="canonical" href="https://www.hellowork.com/fr-fr/emplois/777.html">
            </head><body><main><h1>Graphiste (H/F)</h1>
            <p>Studio Lumen recrute à Brest en CDI, pour une durée indéterminée,
            avec une équipe de dix personnes.</p></main></body></html>`;

        const offer = parseJobOffer(page);

        expect(offer.link).toBe('https://www.hellowork.com/fr-fr/emplois/777.html');
        expect(offer.source).toBe('HelloWork');
    });

    it('lit un salaire écrit « Euros », et remet la ville en casse normale', () => {
        // Formulations des sites publics : « 35 - RENNES » et « Euros ».
        const texte = [
            'Secrétaire médicale (H/F)',
            '35 - RENNES',
            'Travail en journéeSalaire- Salaire brut : Mensuel de 1868.0 Euros à 2500.0 Euros'
        ].join('\n');

        const offer = parseJobOffer(texte);

        expect(offer.location).toBe('Rennes (35)');
        expect(offer.salary).toBe('Mensuel de 1868.0 Euros à 2500.0 Euros');
    });

    it('laisse passer une page sans contenu principal déclaré', () => {
        const brut = `<html><body><div class="offre">
            <h1>Graphiste (H/F)</h1>
            <p>Atelier Verso recrute à Nantes en CDI.</p>
        </div></body></html>`;

        const offer = parseJobOffer(brut);
        expect(offer.title).toBe('Graphiste (H/F)');
        expect(offer.companyName).toBe('Atelier Verso');
        expect(offer.location).toBe('Nantes');
        expect(offer.contractType).toBe('CDI');
    });
});
