import { Injectable } from '@angular/core';
import { JobOffer } from './offers.service';
import { Task } from '../../tasks/task.model';

export interface User {
    id: string;
    fullName: string;
    email: string;
    password: string;
    authMethod: 'email' | 'google';
    createdAt: Date;
    title?: string;
    location?: string;
    bio?: string;
    skills?: string[];
}

export interface AppData {
    currentUser: User | null;
    theme: 'light' | 'dark';
    offers: JobOffer[];
    tasks: Task[];
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
    loadAppData(): AppData {
        const dataJson = localStorage.getItem(this.STORAGE_KEY);

        if (!dataJson) {
            return this.getDefaultAppData();
        }

        try {
            const data = JSON.parse(dataJson);

            // Convert date strings back to Date objects
            if (data.currentUser?.createdAt) {
                data.currentUser.createdAt = new Date(data.currentUser.createdAt);
            }

            if (data.offers) {
                data.offers = data.offers.map((offer: any) => ({
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

            if (data.tasks) {
                data.tasks = data.tasks.map((task: any) => ({
                    ...task,
                    dueDate: new Date(task.dueDate)
                }));
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
    saveAppData(data: AppData): void {
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
            currentUser: null,
            theme: 'light',
            offers: [],
            tasks: []
        };
    }

    /**
     * Update current user
     */
    updateCurrentUser(user: User | null): void {
        const data = this.loadAppData();
        data.currentUser = user;
        this.saveAppData(data);
    }

    /**
     * Update theme
     */
    updateTheme(theme: 'light' | 'dark'): void {
        const data = this.loadAppData();
        data.theme = theme;
        this.saveAppData(data);
    }

    /**
     * Update offers
     */
    updateOffers(offers: JobOffer[]): void {
        const data = this.loadAppData();
        data.offers = offers;
        this.saveAppData(data);
    }

    /**
     * Update tasks
     */
    updateTasks(tasks: Task[]): void {
        const data = this.loadAppData();
        data.tasks = tasks;
        this.saveAppData(data);
    }

    /**
     * Clear all application data
     */
    clearAllData(): void {
        localStorage.removeItem(this.STORAGE_KEY);
    }

    /**
     * Get current user
     */
    getCurrentUser(): User | null {
        const data = this.loadAppData();
        return data.currentUser;
    }

    /**
     * Get theme
     */
    getTheme(): 'light' | 'dark' {
        const data = this.loadAppData();
        return data.theme;
    }

    /**
     * Get offers
     */
    getOffers(): JobOffer[] {
        const data = this.loadAppData();
        return data.offers;
    }

    /**
     * Get tasks
     */
    getTasks(): Task[] {
        const data = this.loadAppData();
        return data.tasks;
    }
}
