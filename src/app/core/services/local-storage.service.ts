import { Injectable } from '@angular/core';
import { JobOffer } from './offers.service';
import { Task } from '../../tasks/task.model';

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

export interface UserData {
    user: User;
    offers: JobOffer[];
    tasks: Task[];
}

export interface AppData {
    currentUserId: string | null;
    users: { [userId: string]: UserData };
}

@Injectable({
    providedIn: 'root'
})
export class LocalStorageService {
    private readonly STORAGE_KEY = 'track_your_job_app_data';

    constructor() { }

    /**
     * Load all application data from localStorage
     */
    private loadAppData(): AppData {
        const dataJson = localStorage.getItem(this.STORAGE_KEY);

        if (!dataJson) {
            return this.getDefaultAppData();
        }

        try {
            const data = JSON.parse(dataJson);

            // Convert date strings back to Date objects for all users
            if (data.users) {
                Object.keys(data.users).forEach(userId => {
                    const userData = data.users[userId];

                    // Migration: Remove obsolete theme property
                    if ('theme' in userData) {
                        delete (userData as any).theme;
                    }

                    // Convert user dates
                    if (userData.user?.createdAt) {
                        userData.user.createdAt = new Date(userData.user.createdAt);
                    }

                    // Convert offer dates
                    if (userData.offers) {
                        userData.offers = userData.offers.map((offer: any) => ({
                            ...offer,
                            dateAdded: new Date(offer.dateAdded),
                            interviewDate: offer.interviewDate ? new Date(offer.interviewDate) : undefined,
                            statusHistory: offer.statusHistory?.map((h: any) => ({
                                ...h,
                                date: new Date(h.date)
                            })),
                            interviews: offer.interviews?.map((i: any) => ({
                                ...i,
                                date: new Date(i.date)
                            }))
                        }));
                    }

                    // Convert task dates
                    if (userData.tasks) {
                        userData.tasks = userData.tasks.map((task: any) => ({
                            ...task,
                            dueDate: new Date(task.dueDate)
                        }));
                    }
                });
            }

            return data;
        } catch (error) {
            console.error('Error loading app data from localStorage:', error);
            return this.getDefaultAppData();
        }
    }

    /**
     * Save all application data to localStorage
     */
    private saveAppData(data: AppData): void {
        try {
            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(data));
        } catch (error) {
            console.error('Error saving app data to localStorage:', error);
        }
    }

    /**
     * Get default application data
     */
    private getDefaultAppData(): AppData {
        return {
            currentUserId: null,
            users: {}
        };
    }

    /**
     * Get current user
     */
    getCurrentUser(): User | null {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return null;
        }
        return data.users[data.currentUserId].user;
    }

    /**
     * Set current user (login)
     */
    setCurrentUser(user: User): void {
        const data = this.loadAppData();

        // If user doesn't exist in users, create their data
        if (!data.users[user.id]) {
            data.users[user.id] = {
                user: user,
                offers: [],
                tasks: []
            };
        } else {
            // Update user info
            data.users[user.id].user = user;
        }

        data.currentUserId = user.id;
        this.saveAppData(data);
    }

    /**
     * Register a new user
     */
    registerUser(user: User): void {
        const data = this.loadAppData();

        data.users[user.id] = {
            user: user,
            offers: [],
            tasks: []
        };

        data.currentUserId = user.id;
        this.saveAppData(data);
    }

    /**
     * Check if email exists
     */
    emailExists(email: string): boolean {
        const data = this.loadAppData();
        return Object.values(data.users).some(userData => userData.user.email === email);
    }

    /**
     * Find user by email
     */
    findUserByEmail(email: string): User | null {
        const data = this.loadAppData();
        const userData = Object.values(data.users).find(userData => userData.user.email === email);
        return userData ? userData.user : null;
    }

    /**
     * Update current user
     */
    updateCurrentUser(updates: Partial<User>): void {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return;
        }

        const currentUserData = data.users[data.currentUserId];
        currentUserData.user = { ...currentUserData.user, ...updates };
        this.saveAppData(data);
    }

    /**
     * Logout current user
     */
    logout(): void {
        const data = this.loadAppData();
        data.currentUserId = null;
        this.saveAppData(data);
    }



    /**
     * Get offers for current user
     */
    getOffers(): JobOffer[] {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return [];
        }
        return data.users[data.currentUserId].offers;
    }

    /**
     * Update offers for current user
     */
    updateOffers(offers: JobOffer[]): void {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return;
        }
        data.users[data.currentUserId].offers = offers;
        this.saveAppData(data);
    }

    /**
     * Get tasks for current user
     */
    getTasks(): Task[] {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return [];
        }
        return data.users[data.currentUserId].tasks;
    }

    /**
     * Update tasks for current user
     */
    updateTasks(tasks: Task[]): void {
        const data = this.loadAppData();
        if (!data.currentUserId || !data.users[data.currentUserId]) {
            return;
        }
        data.users[data.currentUserId].tasks = tasks;
        this.saveAppData(data);
    }

    /**
     * Delete current user account
     */
    deleteCurrentUser(): void {
        const data = this.loadAppData();
        if (!data.currentUserId) {
            return;
        }

        delete data.users[data.currentUserId];
        data.currentUserId = null;
        this.saveAppData(data);
    }

    /**
     * Clear all application data
     */
    clearAllData(): void {
        localStorage.removeItem(this.STORAGE_KEY);
    }
}
