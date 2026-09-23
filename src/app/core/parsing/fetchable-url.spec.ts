import { isFetchableUrl } from './fetchable-url';

describe('adresse lisible par le serveur', () => {

    it('accepte une annonce publique', () => {
        const check = isFetchableUrl('https://www.hellowork.com/fr-fr/emplois/12345.html');

        expect(check.ok).toBeTrue();
        expect(check.url).toBe('https://www.hellowork.com/fr-fr/emplois/12345.html');
    });

    it('accepte http autant que https', () => {
        expect(isFetchableUrl('http://exemple.fr/offre').ok).toBeTrue();
    });

    it('refuse ce qui n\'est pas une adresse web', () => {
        expect(isFetchableUrl('').ok).toBeFalse();
        expect(isFetchableUrl('   ').ok).toBeFalse();
        expect(isFetchableUrl('Chargée de communication').ok).toBeFalse();
        expect(isFetchableUrl('file:///C:/Users/compte/documents').ok).toBeFalse();
        expect(isFetchableUrl('ftp://exemple.fr/offre').ok).toBeFalse();
    });

    it('refuse les machines privées et la boucle locale', () => {
        const refused = [
            'http://localhost:4200/offre',
            'http://127.0.0.1/offre',
            'http://[::1]/offre',
            'http://0.0.0.0/',
            'http://10.0.0.5/interne',
            'http://192.168.1.10/routeur',
            'http://172.16.4.2/interne',
            'http://intranet/offres',
            'http://serveur.local/offre',
            'http://api.internal/secret'
        ];

        for (const address of refused) {
            expect(isFetchableUrl(address).ok).withContext(address).toBeFalse();
        }
    });

    it('refuse l\'adresse de métadonnées de l\'hébergeur', () => {
        // C'est la cible classique de ce genre de détournement : elle rend
        // les jetons d'accès de la machine.
        expect(isFetchableUrl('http://169.254.169.254/computeMetadata/v1/').ok).toBeFalse();
        expect(isFetchableUrl('http://metadata.google.internal/').ok).toBeFalse();
    });

    it('explique en français ce qu\'il refuse', () => {
        expect(isFetchableUrl('http://192.168.0.1/').reason).toContain('privée');
        expect(isFetchableUrl('ftp://exemple.fr').reason).toContain('http');
        expect(isFetchableUrl('n\'importe quoi').reason).toContain('valide');
    });
});
