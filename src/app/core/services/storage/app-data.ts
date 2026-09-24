import { Task } from '../../../tasks/task.model';
import {
    Application,
    Campaign,
    Company,
    Contact,
    FavoriteOffer,
    Profile
} from '../../models/job-search.models';

export const STORAGE_KEY = 'track_your_job_app_data';

/** v1 = une liste d'offres qui portaient tout. v2 = entités séparées. */
export const SCHEMA_VERSION = 2;

export interface UserData {
    profile: Profile;
    /** Compteur d'identifiants, pour ne plus dépendre de Date.now(). */
    nextId: number;
    campaigns: Campaign[];
    companies: Company[];
    contacts: Contact[];
    applications: Application[];
    tasks: Task[];
    /** Offres mises de côté depuis la recherche. */
    favorites: FavoriteOffer[];
}

export interface AppData {
    schemaVersion: number;
    currentUserId: string | null;
    users: { [userId: string]: UserData };
}

export function emptyAppData(): AppData {
    return { schemaVersion: SCHEMA_VERSION, currentUserId: null, users: {} };
}

export function emptyUserData(profile: Profile): UserData {
    return {
        profile,
        nextId: 2,
        campaigns: [{
            id: 1,
            name: 'Ma recherche',
            startedAt: profile.createdAt,
            status: 'active'
        }],
        companies: [],
        contacts: [],
        applications: [],
        tasks: [],
        favorites: []
    };
}

// ---------------------------------------------------------------------------
// Formes de l'ancien schéma, telles qu'elles existent dans le localStorage.
// Uniquement lues par la migration.
// ---------------------------------------------------------------------------

export interface LegacyUser {
    id: string;
    fullName: string;
    email: string;
    password: string;
    authMethod?: 'email';
    createdAt?: string | Date;
    title?: string;
    location?: string;
    skills?: string[];
}

export interface LegacyContact {
    name: string;
    role?: string;
    email?: string;
    phone?: string;
}

export interface LegacyOffer {
    id: number;
    title: string;
    company: string;
    status: string;
    location?: string;
    salary?: string;
    dateAdded: string | Date;
    description?: string;
    contractDuration?: string;
    weeklyHours?: string;
    contractType?: string;
    link?: string;
    companyDescription?: string;
    missions?: string;
    profile?: string;
    benefits?: string;
    recruitmentProcess?: string;
    others?: string;
    statusHistory?: { status: string; date: string | Date; details?: string }[];
    interviewDate?: string | Date;
    interviewType?: string;
    interviews?: { date: string | Date; type: string; details?: string }[];
    companyInfo?: {
        id?: number;
        employees?: number;
        founded?: number;
        group?: string;
        contacts?: LegacyContact[];
    };
}

export interface LegacyUserData {
    user: LegacyUser;
    offers?: LegacyOffer[];
    tasks?: Task[];
}

export interface LegacyAppData {
    currentUserId: string | null;
    users: { [userId: string]: LegacyUserData };
}
