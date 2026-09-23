import { Injectable } from '@angular/core';
import { AppData, STORAGE_KEY, UserData } from './storage/app-data';
import { migrateAppData, normalizeUserData } from './storage/migrate';

/** Fichier produit par l'export : entête + données d'un seul compte. */
interface BackupFile {
    schemaVersion?: number;
    exportedAt?: string;
    data?: UserData;
}

/**
 * Sauvegardes et reprise de l'ancien stockage local.
 *
 * Les données vivent maintenant dans Firestore. Ce service ne sert plus qu'à
 * deux choses : proposer la reprise de ce qui traîne encore dans le
 * navigateur, et lire ou écrire un fichier de sauvegarde.
 */
@Injectable({
    providedIn: 'root'
})
export class BackupService {

    /** Reste-t-il des données de l'ancienne version dans ce navigateur ? */
    hasLocalData(): boolean {
        return this.readLocalData() !== null;
    }

    /**
     * Lit ce qui reste dans le localStorage, quel que soit son schéma, et en
     * retourne le premier compte trouvé.
     */
    readLocalData(): UserData | null {
        const json = localStorage.getItem(STORAGE_KEY);
        if (!json) return null;

        try {
            const migrated: AppData = migrateAppData(JSON.parse(json));
            const accounts = Object.values(migrated.users);
            const preferred = migrated.currentUserId
                ? migrated.users[migrated.currentUserId]
                : undefined;
            return preferred ?? accounts[0] ?? null;
        } catch {
            return null;
        }
    }

    /** Une fois la reprise faite, on ne laisse pas de copie en arrière. */
    clearLocalData(): void {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem('track_your_job_app_data_backup_v1');
    }

    /**
     * Lit un fichier de sauvegarde. Accepte le format produit ici comme un
     * export de l'ancienne version, qui contenait tous les comptes.
     */
    parseBackup(json: string): UserData | null {
        let raw: unknown;
        try {
            raw = JSON.parse(json);
        } catch {
            return null;
        }

        const file = raw as BackupFile;
        if (file && file.data && typeof file.data === 'object') {
            return normalizeUserData(file.data);
        }

        try {
            const migrated = migrateAppData(raw);
            // Un export de l'ancienne version pouvait contenir plusieurs
            // comptes : on reprend celui qui était connecté, pas le premier
            // venu dans l'ordre du fichier.
            const preferred = migrated.currentUserId
                ? migrated.users[migrated.currentUserId]
                : undefined;
            return preferred ?? Object.values(migrated.users)[0] ?? null;
        } catch {
            return null;
        }
    }

    /** Déclenche le téléchargement du fichier de sauvegarde. */
    download(json: string): void {
        const blob = new Blob([json], { type: 'application/json' });
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `track-your-job-${new Date().toISOString().split('T')[0]}.json`;
        link.click();
        window.URL.revokeObjectURL(url);
    }
}
