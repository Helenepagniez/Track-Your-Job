import { Injectable } from '@angular/core';
import { Task } from '../../tasks/task.model';
import { Profile } from '../models/job-search.models';
import {
    AppData,
    STORAGE_KEY,
    SCHEMA_VERSION,
    UserData,
    emptyAppData,
    emptyUserData
} from './storage/app-data';
import { migrateAppData } from './storage/migrate';

/** Copie de l'ancien contenu, conservée une fois, avant la première migration. */
const LEGACY_BACKUP_KEY = 'track_your_job_app_data_backup_v1';

/**
 * Identité de l'utilisateur telle que la manipulent AuthService et les écrans
 * existants. C'est une vue du `Profile` stocké : `createdAt` y est une Date.
 */
export interface User {
    id: string;
    fullName: string;
    email: string;
    password: string;
    authMethod: 'email';
    createdAt: Date;
    title?: string;
    location?: string;
    skills?: string[];
}

/**
 * Seul point de contact avec le localStorage. Détient le schéma, applique la
 * migration au chargement, et ne connaît rien du métier au-delà de l'identité.
 */
@Injectable({
    providedIn: 'root'
})
export class LocalStorageService {

    // ---------------------------------------------------------------- stockage

    private loadAppData(): AppData {
        const json = localStorage.getItem(STORAGE_KEY);
        if (!json) {
            return emptyAppData();
        }

        let raw: unknown;
        try {
            raw = JSON.parse(json);
        } catch (error) {
            console.error('Contenu illisible dans le localStorage :', error);
            return emptyAppData();
        }

        const isCurrentSchema =
            !!raw && typeof raw === 'object' && (raw as AppData).schemaVersion === SCHEMA_VERSION;

        const data = migrateAppData(raw);

        if (!isCurrentSchema) {
            // On ne réécrit l'ancien format qu'une fois, et on en garde une copie.
            if (!localStorage.getItem(LEGACY_BACKUP_KEY)) {
                try {
                    localStorage.setItem(LEGACY_BACKUP_KEY, json);
                } catch (error) {
                    console.warn('Sauvegarde de l\'ancien format impossible :', error);
                }
            }
            this.saveAppData(data);
        }

        return data;
    }

    private saveAppData(data: AppData): void {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Écriture impossible dans le localStorage :', error);
        }
    }

    // ------------------------------------------------------------- identité

    getCurrentUser(): User | null {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return null;
        }
        return toUser(data.users[data.currentUserId].profile);
    }

    setCurrentUser(user: User): void {
        const data = this.loadAppData();

        if (!data.users[user.id]) {
            data.users[user.id] = emptyUserData(toProfile(user));
        } else {
            data.users[user.id].profile = toProfile(user);
        }

        data.currentUserId = user.id;
        this.saveAppData(data);
    }

    registerUser(user: User): void {
        const data = this.loadAppData();
        data.users[user.id] = emptyUserData(toProfile(user));
        data.currentUserId = user.id;
        this.saveAppData(data);
    }

    emailExists(email: string): boolean {
        const data = this.loadAppData();
        return Object.values(data.users).some(userData => userData.profile.email === email);
    }

    findUserByEmail(email: string): User | null {
        const data = this.loadAppData();
        const userData = Object.values(data.users).find(entry => entry.profile.email === email);
        return userData ? toUser(userData.profile) : null;
    }

    updateCurrentUser(updates: Partial<User>): void {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return;
        }
        const userData = data.users[data.currentUserId];
        userData.profile = { ...userData.profile, ...toProfilePatch(updates) };
        this.saveAppData(data);
    }

    /**
     * Change le mot de passe d'un compte de ce navigateur, sans être connecté.
     * Sert à la réinitialisation locale : les données de ce navigateur sont déjà
     * lisibles sans mot de passe, cela n'ouvre donc aucun accès nouveau.
     */
    updatePasswordByEmail(email: string, password: string): boolean {
        const data = this.loadAppData();
        const entry = Object.values(data.users).find(userData => userData.profile.email === email);
        if (!entry) {
            return false;
        }
        entry.profile = { ...entry.profile, password };
        this.saveAppData(data);
        return true;
    }

    logout(): void {
        const data = this.loadAppData();
        data.currentUserId = null;
        this.saveAppData(data);
    }

    deleteCurrentUser(): void {
        const data = this.loadAppData();
        if (!data.currentUserId) {
            return;
        }
        delete data.users[data.currentUserId];
        data.currentUserId = null;
        this.saveAppData(data);
    }

    // ------------------------------------------------- données de recherche

    /** Profil complet de l'utilisateur courant (champs de la refonte inclus). */
    getProfile(): Profile | null {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return null;
        }
        return data.users[data.currentUserId].profile;
    }

    updateProfile(updates: Partial<Profile>): void {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return;
        }
        const userData = data.users[data.currentUserId];
        userData.profile = { ...userData.profile, ...updates };
        this.saveAppData(data);
    }

    getUserData(): UserData | null {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return null;
        }
        return data.users[data.currentUserId];
    }

    setUserData(userData: UserData): void {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return;
        }
        data.users[data.currentUserId] = userData;
        this.saveAppData(data);
    }

    // ---------------------------------------------------------------- tâches

    getTasks(): Task[] {
        // Le JSON ne connaît pas les dates : on les rend aux écrans.
        return (this.getUserData()?.tasks ?? []).map(task => ({
            ...task,
            dueDate: new Date(task.dueDate)
        }));
    }

    updateTasks(tasks: Task[]): void {
        const userData = this.getUserData();
        if (!userData) {
            return;
        }
        this.setUserData({ ...userData, tasks });
    }

    // ------------------------------------------------------- import / export

    clearAllData(): void {
        localStorage.removeItem(STORAGE_KEY);
    }

    exportData(): string {
        return JSON.stringify(this.loadAppData(), null, 2);
    }

    /**
     * Importe un export, quel que soit son schéma : un fichier produit par
     * l'ancienne version est migré à la volée.
     */
    importData(jsonString: string): boolean {
        try {
            const raw = JSON.parse(jsonString);
            if (!raw || typeof raw !== 'object') {
                return false;
            }
            this.saveAppData(migrateAppData(raw));
            return true;
        } catch (error) {
            console.error('Import impossible :', error);
            return false;
        }
    }
}

// --------------------------------------------------------------------------

function toUser(profile: Profile): User {
    return {
        id: profile.id,
        fullName: profile.fullName,
        email: profile.email,
        password: profile.password,
        authMethod: 'email',
        createdAt: new Date(profile.createdAt),
        title: profile.title,
        location: profile.location,
        skills: profile.skills
    };
}

function toProfile(user: User): Profile {
    return {
        id: user.id,
        fullName: user.fullName,
        email: user.email,
        password: user.password,
        authMethod: 'email',
        createdAt: user.createdAt instanceof Date
            ? user.createdAt.toISOString()
            : new Date(user.createdAt).toISOString(),
        title: user.title,
        location: user.location,
        skills: user.skills
    };
}

function toProfilePatch(updates: Partial<User>): Partial<Profile> {
    const patch: Partial<Profile> = {};
    if (updates.fullName !== undefined) patch.fullName = updates.fullName;
    if (updates.email !== undefined) patch.email = updates.email;
    if (updates.password !== undefined) patch.password = updates.password;
    if (updates.title !== undefined) patch.title = updates.title;
    if (updates.location !== undefined) patch.location = updates.location;
    if (updates.skills !== undefined) patch.skills = updates.skills;
    if (updates.createdAt !== undefined) {
        patch.createdAt = updates.createdAt instanceof Date
            ? updates.createdAt.toISOString()
            : new Date(updates.createdAt).toISOString();
    }
    return patch;
}
