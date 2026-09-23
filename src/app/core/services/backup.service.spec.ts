import { TestBed } from '@angular/core/testing';
import { currentStatus } from '../models/job-search.models';
import { BackupService } from './backup.service';
import { SCHEMA_VERSION, STORAGE_KEY } from './storage/app-data';

/**
 * Le fichier que produit `tools/export-production-data.js` est le contenu brut
 * de la clé de stockage de la version précédente. Ces tests vérifient qu'il
 * est relisible, puisque c'est par là que passent les vraies données.
 */
function productionDump(): string {
    return JSON.stringify({
        currentUserId: 'user_1',
        users: {
            user_1: {
                user: {
                    id: 'user_1',
                    fullName: 'Prénom Nom',
                    email: 'compte@example.com',
                    password: 'secret',
                    authMethod: 'email',
                    createdAt: '2025-04-24T08:00:00.000Z'
                },
                offers: [
                    {
                        id: 1001,
                        title: 'Chargée de communication',
                        company: 'Alpha',
                        status: 'Rejected',
                        dateAdded: '2026-03-02T09:00:00.000Z',
                        statusHistory: [
                            { status: 'Applied', date: '2026-03-02T09:00:00.000Z' },
                            { status: 'Rejected', date: '2026-06-18T09:00:00.000Z' }
                        ],
                        companyInfo: {
                            id: 7,
                            employees: 120,
                            contacts: [{ name: 'Contact Alpha', role: 'RH', email: 'rh@alpha.test' }]
                        }
                    }
                ],
                tasks: [
                    { id: 1, title: 'Relancer Alpha', dueDate: '2026-04-20T09:00:00.000Z', completed: false }
                ]
            }
        }
    });
}

describe('BackupService', () => {
    let backup: BackupService;

    beforeEach(() => {
        localStorage.removeItem(STORAGE_KEY);
        TestBed.configureTestingModule({});
        backup = TestBed.inject(BackupService);
    });

    afterEach(() => {
        localStorage.removeItem(STORAGE_KEY);
    });

    it('relit un export de la version précédente', () => {
        const restored = backup.parseBackup(productionDump());

        expect(restored).not.toBeNull();
        expect(restored!.profile.email).toBe('compte@example.com');
        expect(restored!.applications.length).toBe(1);
        expect(restored!.companies.length).toBe(1);
        expect(restored!.contacts.length).toBe(1);
        expect(restored!.tasks.length).toBe(1);
    });

    it('garde la date du refus, et non celle de la reprise', () => {
        const restored = backup.parseBackup(productionDump());
        const application = restored!.applications[0];

        expect(currentStatus(application)).toBe('rejected');
        expect(application.events.some(event =>
            event.type === 'status' && event.at.startsWith('2026-06-18')
        )).toBeTrue();
    });

    it('reprend le compte connecté quand le fichier en contient plusieurs', () => {
        // Cas réel : l'ancienne version gardait tous les comptes créés sur le
        // navigateur, y compris ceux d'essai.
        const dump = JSON.parse(productionDump());
        dump.users['user_2'] = {
            user: { id: 'user_2', fullName: 'Autre Personne', email: 'autre@example.com' },
            offers: [],
            tasks: []
        };
        dump.currentUserId = 'user_1';

        const restored = backup.parseBackup(JSON.stringify(dump));

        expect(restored!.profile.email).toBe('compte@example.com');
        expect(restored!.applications.length).toBe(1);
    });

    it('relit aussi un export produit par la nouvelle version', () => {
        const source = backup.parseBackup(productionDump())!;
        const file = JSON.stringify({
            schemaVersion: SCHEMA_VERSION,
            exportedAt: new Date().toISOString(),
            data: source
        });

        const restored = backup.parseBackup(file);

        expect(restored).not.toBeNull();
        expect(restored!.applications.length).toBe(source.applications.length);
        expect(restored!.profile.fullName).toBe('Prénom Nom');
    });

    it('refuse un fichier qui ne contient pas une sauvegarde', () => {
        expect(backup.parseBackup('pas du json')).toBeNull();
        expect(backup.parseBackup('{"autre":"chose"}')).toBeNull();
    });

    it('voit les données restées dans ce navigateur, et sait les effacer', () => {
        localStorage.setItem(STORAGE_KEY, productionDump());
        expect(backup.hasLocalData()).toBeTrue();
        expect(backup.readLocalData()!.applications.length).toBe(1);

        backup.clearLocalData();
        expect(backup.hasLocalData()).toBeFalse();
    });
});
