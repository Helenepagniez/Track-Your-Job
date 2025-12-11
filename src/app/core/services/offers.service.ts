import { Injectable, signal, computed, effect } from '@angular/core';
import { TasksService } from './tasks.service';
import { LocalStorageService } from './local-storage.service';
import { AuthService } from './auth.service';

export interface StatusHistoryEntry {
    status: string;
    date: Date;
    details?: string;
}

export interface Interview {
    date: Date;
    type: 'Préqual' | 'Entretien Physique' | 'Entretien Téléphonique' | 'Entretien Visio';
    details?: string;
}

export interface JobOffer {
    id: number;
    title: string;
    company: string;
    status: 'To Apply' | 'Applied' | 'Interview' | 'Offer' | 'Rejected' | 'To Relaunch' | 'No Response';
    location: string;
    salary?: string;
    dateAdded: Date;
    description?: string;
    // New fields
    contractType?: string;
    link?: string;
    companyDescription?: string;
    missions?: string;
    profile?: string;
    benefits?: string;
    recruitmentProcess?: string;
    others?: string;
    statusHistory?: StatusHistoryEntry[];
    interviewDate?: Date;
    interviewType?: 'Préqual' | 'Entretien Physique' | 'Entretien Téléphonique' | 'Entretien Visio';
    interviews?: Interview[];
    companyInfo?: {
        id?: number;
        employees?: number;
        founded?: number;
        group?: string;
        contacts?: {
            name: string;
            role?: string;
            email?: string;
            phone?: string;
        }[];
    };
}

@Injectable({
    providedIn: 'root'
})
export class OffersService {
    offers = signal<JobOffer[]>([]);

    getOffer(id: number): JobOffer | undefined {
        return this.offers().find(o => o.id === id);
    }

    getStatusLabel(status: string): string {
        const labels: Record<string, string> = {
            'To Apply': 'À postuler',
            'Applied': 'En attente',
            'To Relaunch': 'À relancer',
            'No Response': 'Sans réponse',
            'Interview': 'Entretien',
            'Offer': 'Offre reçue',
            'Rejected': 'Refusé'
        };
        return labels[status] || status;
    }

    /**
     * Get the company ID for a given company name.
     * If the company already exists, return its ID.
     * Otherwise, create a new unique ID.
     */
    private getOrCreateCompanyId(companyName: string): number {
        // Find ALL offers with this company name and collect their IDs
        const offersWithSameCompany = this.offers().filter(o => o.company === companyName);
        const existingIds = offersWithSameCompany
            .map(o => o.companyInfo?.id)
            .filter((id): id is number => id !== undefined);

        // If we found at least one ID, use the first one (they should all be the same after normalization)
        if (existingIds.length > 0) {
            return existingIds[0];
        }

        // Create a new unique company ID
        const allCompanyIds = this.offers()
            .map(o => o.companyInfo?.id)
            .filter((id): id is number => id !== undefined);

        const maxId = allCompanyIds.length > 0 ? Math.max(...allCompanyIds) : 0;
        return maxId + 1;
    }

    // ... inside class OffersService
    constructor(
        private tasksService: TasksService,
        private localStorageService: LocalStorageService,
        private authService: AuthService
    ) {
        // Load offers from localStorage
        this.loadOffersFromStorage();

        // Normalize company IDs first
        this.normalizeCompanyIds();

        // Run automation check on initialization
        this.checkAndAutomateOffers();

        // Set up auto-save effect
        effect(() => {
            const currentOffers = this.offers();
            this.localStorageService.updateOffers(currentOffers);
        });
    }

    /**
     * Load offers from localStorage
     */
    private loadOffersFromStorage() {
        const offers = this.localStorageService.getOffers();
        if (offers && offers.length > 0) {
            this.offers.set(offers);
        }
    }

    /**
     * Ensures all offers from the same company share the same companyInfo.id
     */
    private normalizeCompanyIds() {
        this.offers.update(offers => {
            const companyIdMap = new Map<string, number>();

            // First pass: collect or create company IDs
            offers.forEach(offer => {
                if (!companyIdMap.has(offer.company)) {
                    // Use existing ID if available, otherwise create a new one
                    const existingId = offer.companyInfo?.id;
                    if (existingId) {
                        companyIdMap.set(offer.company, existingId);
                    } else {
                        // Create new ID
                        const maxId = Math.max(0, ...Array.from(companyIdMap.values()));
                        companyIdMap.set(offer.company, maxId + 1);
                    }
                }
            });

            // Second pass: apply the normalized IDs
            return offers.map(offer => ({
                ...offer,
                companyInfo: {
                    ...offer.companyInfo,
                    id: companyIdMap.get(offer.company)!
                }
            }));
        });
    }

    private checkAndAutomateOffers() {
        const now = new Date();
        const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
        const fiveWeeksMs = 35 * 24 * 60 * 60 * 1000;

        this.offers.update(offers => {
            const updatedOffers = offers.map(offer => {
                // We are looking for offers with status 'Applied' (En attente)
                if (offer.status === 'Applied') {
                    // Find the date we switched to 'Applied'
                    // For now, if no history, fallback to dateAdded if status was Applied on add
                    // But we will implement history tracking now.
                    // If no history, we assume dateAdded is the start.

                    let applicationDate = offer.dateAdded;
                    if (offer.statusHistory && offer.statusHistory.length > 0) {
                        const appliedEntry = [...offer.statusHistory].reverse().find(h => h.status === 'Applied');
                        if (appliedEntry) {
                            applicationDate = new Date(appliedEntry.date);
                        }
                    }

                    const timeDiff = now.getTime() - new Date(applicationDate).getTime();

                    // Check 5 weeks -> 'No Response'
                    if (timeDiff >= fiveWeeksMs) {
                        // Create status change entry
                        const newHistory: StatusHistoryEntry[] = [
                            ...(offer.statusHistory || []),
                            { status: 'No Response', date: new Date() }
                        ];
                        // Explicitly cast or typed object
                        const updatedOffer: JobOffer = {
                            ...offer,
                            status: 'No Response',
                            statusHistory: newHistory
                        };
                        return updatedOffer;
                    }
                    // Check 2 weeks -> 'To Relaunch'
                    else if (timeDiff >= twoWeeksMs) {
                        // Create Task
                        this.tasksService.addTask({
                            id: Date.now(),
                            title: 'À relancer',
                            dueDate: new Date(),
                            completed: false,
                            status: 'a_faire',
                            priority: 'haute',
                            relatedOffers: [`${offer.title} - ${offer.company} - À relancer`]
                        });

                        const newHistory: StatusHistoryEntry[] = [
                            ...(offer.statusHistory || []),
                            { status: 'To Relaunch', date: new Date() }
                        ];
                        const updatedOffer: JobOffer = {
                            ...offer,
                            status: 'To Relaunch',
                            statusHistory: newHistory
                        };
                        return updatedOffer;
                    }
                }
                return offer;
            });
            return updatedOffers;
        });
    }

    addOffer(offer: JobOffer) {
        // Ensure the offer has a companyInfo.id
        const companyId = this.getOrCreateCompanyId(offer.company);

        // Check if there's an existing company with this name
        const existingOffer = this.offers().find(o => o.company === offer.company);
        const existingDescription = existingOffer?.companyDescription;
        const existingCompanyInfo = existingOffer?.companyInfo;

        // Initialize history with 'To Apply' always
        const initialHistory: StatusHistoryEntry[] = [
            { status: 'To Apply', date: offer.dateAdded }
        ];

        // If current status is different, add it to history
        if (offer.status !== 'To Apply') {
            initialHistory.push({ status: offer.status, date: new Date() });
        }

        // Convert legacy interview fields to interviews array if status is Interview
        let interviews = offer.interviews || [];
        if (offer.status === 'Interview' && offer.interviewDate && offer.interviewType) {
            // Check if this interview already exists in the array
            const interviewExists = interviews.some(i =>
                new Date(i.date).getTime() === new Date(offer.interviewDate!).getTime() &&
                i.type === offer.interviewType
            );

            if (!interviewExists) {
                const newInterview = {
                    date: new Date(offer.interviewDate),
                    type: offer.interviewType,
                    details: undefined
                };
                interviews = [
                    ...interviews,
                    newInterview
                ];

                // Create a task for this new interview
                let taskTitle: string = newInterview.type;
                if (newInterview.type === 'Préqual') {
                    taskTitle = 'Préqualification';
                }
                const statusLabel = this.getStatusLabel(offer.status);
                const offerInfo = `${offer.title} - ${offer.company} - ${statusLabel}`;

                this.tasksService.addTask({
                    id: Date.now() + Math.random(),
                    title: taskTitle,
                    dueDate: new Date(newInterview.date),
                    completed: false,
                    status: 'a_faire',
                    priority: 'haute',
                    relatedOffers: [offerInfo]
                });
            }
        }

        const offerWithCompanyId: JobOffer = {
            ...offer,
            statusHistory: initialHistory,
            interviews: interviews.length > 0 ? interviews : undefined,
            companyInfo: {
                id: companyId,
                // Inherit existing company info, but allow new values to override
                employees: existingCompanyInfo?.employees,
                founded: existingCompanyInfo?.founded,
                group: existingCompanyInfo?.group,
                contacts: existingCompanyInfo?.contacts,
                // Override with any new values provided
                ...offer.companyInfo
            },
            // Use the new description if provided, otherwise inherit from existing offers
            companyDescription: offer.companyDescription || existingDescription
        };

        this.offers.update(offers => {
            const newOffers = [offerWithCompanyId, ...offers];

            // IMPORTANT: Propagate the companyId to ALL offers of the same company
            // This ensures consistency across all offers
            return newOffers.map(o => {
                if (o.company === offerWithCompanyId.company) {
                    return {
                        ...o,
                        companyInfo: {
                            ...o.companyInfo,
                            id: companyId
                        },
                        // If the new offer has a companyDescription, propagate it
                        companyDescription: offerWithCompanyId.companyDescription || o.companyDescription
                    };
                }
                return o;
            });
        });
    }

    updateOffer(updatedOffer: JobOffer) {
        // Ensure the offer has a companyInfo.id
        const companyId = this.getOrCreateCompanyId(updatedOffer.company);

        // Get the current company data to preserve it
        const currentOffer = this.offers().find(o => o.id === updatedOffer.id);
        const existingOffer = this.offers().find(o => o.company === updatedOffer.company);

        const currentCompanyDescription = existingOffer?.companyDescription;
        const existingCompanyInfo = existingOffer?.companyInfo;

        // Check for status change to update history
        let newHistory = updatedOffer.statusHistory || [];

        // Detect if statusHistory is being edited from the modal
        // The modal always provides a new array (cloned), so if the reference is different, it's from the modal
        const currentHistory = currentOffer?.statusHistory || [];
        const isHistoryBeingEditedFromModal = updatedOffer.statusHistory &&
            updatedOffer.statusHistory !== currentHistory;

        // If status changed and history is NOT being edited from modal, add new entry
        if (!isHistoryBeingEditedFromModal && currentOffer && currentOffer.status !== updatedOffer.status) {
            newHistory = [
                ...(currentOffer.statusHistory || []),
                { status: updatedOffer.status, date: new Date() }
            ];
        } else if (!isHistoryBeingEditedFromModal && currentOffer) {
            // If status didn't change and history is not being edited, preserve current history
            newHistory = currentOffer.statusHistory || [];
        }
        // else: if history is being edited from modal, use the provided history as-is (newHistory already set)

        // Convert legacy interview fields to interviews array if status is Interview
        // Detect if interviews are being edited from the modal
        const isInterviewsBeingEditedFromModal = updatedOffer.interviews &&
            updatedOffer.interviews !== currentOffer?.interviews;

        let interviews = updatedOffer.interviews || currentOffer?.interviews || [];

        // Only auto-convert if interviews are NOT being edited from modal
        if (!isInterviewsBeingEditedFromModal &&
            updatedOffer.status === 'Interview' &&
            updatedOffer.interviewDate &&
            updatedOffer.interviewType) {

            // Check if this interview already exists in the array
            const interviewExists = interviews.some(i =>
                new Date(i.date).getTime() === new Date(updatedOffer.interviewDate!).getTime() &&
                i.type === updatedOffer.interviewType
            );

            if (!interviewExists) {
                const newInterview = {
                    date: new Date(updatedOffer.interviewDate),
                    type: updatedOffer.interviewType,
                    details: undefined
                };
                interviews = [
                    ...interviews,
                    newInterview
                ];

                // Create a task for this new interview
                let taskTitle: string = newInterview.type;
                if (newInterview.type === 'Préqual') {
                    taskTitle = 'Préqualification';
                }
                const statusLabel = this.getStatusLabel(updatedOffer.status);
                const offerInfo = `${updatedOffer.title} - ${updatedOffer.company} - ${statusLabel}`;

                this.tasksService.addTask({
                    id: Date.now() + Math.random(),
                    title: taskTitle,
                    dueDate: new Date(newInterview.date),
                    completed: false,
                    status: 'a_faire',
                    priority: 'haute',
                    relatedOffers: [offerInfo]
                });
            }
        }

        const offerWithCompanyId: JobOffer = {
            ...updatedOffer,
            statusHistory: newHistory,
            interviews: interviews.length > 0 ? interviews : undefined,
            companyInfo: {
                // Preserve existing company info
                employees: existingCompanyInfo?.employees,
                founded: existingCompanyInfo?.founded,
                group: existingCompanyInfo?.group,
                contacts: existingCompanyInfo?.contacts,
                // But allow any explicitly provided values to override
                ...updatedOffer.companyInfo,
                // IMPORTANT: Always use the calculated companyId, never the one from updatedOffer
                // This ensures the ID is correct even when changing companies
                id: companyId
            },
            // Preserve the existing company description - it should only be modified from company page
            companyDescription: currentCompanyDescription
        };

        this.offers.update(offers => {
            // Update the specific offer
            const updatedOffers = offers.map(o =>
                o.id === offerWithCompanyId.id ? offerWithCompanyId : o
            );

            // IMPORTANT: Propagate the companyId to ALL offers of the same company
            // This ensures consistency across all offers
            return updatedOffers.map(o => {
                if (o.company === offerWithCompanyId.company && o.id !== offerWithCompanyId.id) {
                    return {
                        ...o,
                        companyInfo: {
                            ...o.companyInfo,
                            id: companyId
                        }
                    };
                }
                return o;
            });
        });
    }

    deleteOffer(id: number) {
        this.offers.update(offers => offers.filter(o => o.id !== id));
    }

    clearAll() {
        this.offers.set([]);
    }

    // Company Management Helpers
    getCompany(identifier: string | number): { name: string, info: any, offers: JobOffer[] } | null {
        let companyOffers: JobOffer[] = [];

        // Check if identifier is a number (ID) or looks like one
        const searchId = Number(identifier);
        const isIdSearch = !isNaN(searchId) && searchId > 0;

        if (isIdSearch) {
            companyOffers = this.offers().filter(o => o.companyInfo?.id === searchId);
        } else {
            // Search by name
            companyOffers = this.offers().filter(o => o.company === identifier);
        }

        if (companyOffers.length === 0) {
            return null;
        }

        // Return info from the most recently added offer as the source of truth
        // IMPORTANT: Create a copy before sorting to avoid mutating the original array
        const latestOffer = [...companyOffers].sort((a, b) =>
            new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime()
        )[0];

        return {
            name: latestOffer.company,
            info: {
                ...latestOffer.companyInfo || {},
                description: latestOffer.companyDescription
            },
            offers: companyOffers
        };
    }

    updateCompanyDetails(companyName: string, newInfo: any) {
        this.offers.update(offers => offers.map(o => {
            if (o.company === companyName) {
                return {
                    ...o,
                    companyInfo: {
                        ...o.companyInfo,
                        ...newInfo
                    },
                    companyDescription: newInfo.description !== undefined ? newInfo.description : o.companyDescription
                };
            }
            return o;
        }));
    }
}
