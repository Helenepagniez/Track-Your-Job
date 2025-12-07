import { Injectable, signal, computed } from '@angular/core';
import { TasksService } from './tasks.service';

export interface StatusHistoryEntry {
    status: string;
    date: Date;
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
    offers = signal<JobOffer[]>([
        {
            id: 1,
            title: 'Senior Angular Developer',
            company: 'Tech Solutions Inc.',
            status: 'Interview',
            location: 'Paris, France',
            salary: '60k - 75k €',
            dateAdded: new Date('2023-10-25'),
            description: 'We are looking for an experienced Angular developer to lead our frontend team.',
            companyInfo: { id: 1, employees: 500, founded: 2010 },
            statusHistory: [
                { status: 'Applied', date: new Date('2023-10-25') },
                { status: 'Interview', date: new Date('2023-10-28') }
            ],
            interviewDate: new Date(Date.now() + 86400000), // Tomorrow
            interviewType: 'Entretien Visio'
        },
        {
            id: 2,
            title: 'Frontend Engineer',
            company: 'Creative Agency',
            status: 'Applied',
            location: 'Remote',
            dateAdded: new Date('2023-11-01'),
            description: 'Join our creative team to build stunning web experiences.',
            companyInfo: { id: 2 },
            statusHistory: [
                { status: 'Applied', date: new Date('2023-11-01') }
            ]
        },
        {
            id: 3,
            title: 'Full Stack Developer',
            company: 'Startup Nation',
            status: 'To Apply',
            location: 'Lyon, France',
            dateAdded: new Date('2023-11-05'),
            description: 'Full stack role using Angular and Node.js.',
            companyInfo: { id: 3 },
            statusHistory: [
                { status: 'To Apply', date: new Date('2023-11-05') }
            ]
        },
        {
            id: 4,
            title: 'Test Relaunch Automation',
            company: 'Test Corp',
            status: 'Applied',
            location: 'Paris',
            dateAdded: new Date(Date.now() - 1728000000), // ~20 days ago (20 * 24 * 3600 * 1000)
            description: 'This offer should automatically switch to To Relaunch',
            companyInfo: { id: 4 },
            statusHistory: [
                { status: 'Applied', date: new Date(Date.now() - 1728000000) }
            ]
        }
    ]);

    getOffer(id: number): JobOffer | undefined {
        return this.offers().find(o => o.id === id);
    }

    /**
     * Get the company ID for a given company name.
     * If the company already exists, return its ID.
     * Otherwise, create a new unique ID.
     */
    private getOrCreateCompanyId(companyName: string): number {
        // Find an existing offer with this company name
        const existingOffer = this.offers().find(o => o.company === companyName);

        if (existingOffer?.companyInfo?.id) {
            return existingOffer.companyInfo.id;
        }

        // Create a new unique company ID
        // Use a hash-like approach based on company name to ensure consistency
        const allCompanyIds = this.offers()
            .map(o => o.companyInfo?.id)
            .filter((id): id is number => id !== undefined);

        const maxId = allCompanyIds.length > 0 ? Math.max(...allCompanyIds) : 0;
        return maxId + 1;
    }

    // ... inside class OffersService
    constructor(private tasksService: TasksService) {
        // Run automation check on initialization
        this.checkAndAutomateOffers();
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
                            relatedOffers: [`${offer.title} - ${offer.company} - To Relaunch`]
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

        const offerWithCompanyId: JobOffer = {
            ...offer,
            statusHistory: initialHistory,
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

            // If the new offer has a companyDescription, propagate it to all offers of the same company
            if (offerWithCompanyId.companyDescription) {
                return newOffers.map(o =>
                    o.company === offerWithCompanyId.company
                        ? { ...o, companyDescription: offerWithCompanyId.companyDescription }
                        : o
                );
            }

            return newOffers;
        });
    }

    updateOffer(updatedOffer: JobOffer) {
        // Ensure the offer has a companyInfo.id
        const companyId = this.getOrCreateCompanyId(updatedOffer.company);

        // Get the current company data to preserve it
        const currentOffer = this.offers().find(o => o.id === updatedOffer.id);
        const existingOffer = this.offers().find(o => o.company === updatedOffer.company); // Might be same or different if company name changed (unlikely use case but possible)

        const currentCompanyDescription = existingOffer?.companyDescription;
        const existingCompanyInfo = existingOffer?.companyInfo;

        // Check for status change to update history
        let newHistory = updatedOffer.statusHistory || [];
        if (currentOffer && currentOffer.status !== updatedOffer.status) {
            newHistory = [
                ...(currentOffer.statusHistory || []),
                { status: updatedOffer.status, date: new Date() }
            ];
            // If we are reverting to 'Applied' or changing to 'Applied', the date is now.
        }

        const offerWithCompanyId: JobOffer = {
            ...updatedOffer,
            statusHistory: newHistory,
            companyInfo: {
                id: companyId,
                // Preserve existing company info
                employees: existingCompanyInfo?.employees,
                founded: existingCompanyInfo?.founded,
                group: existingCompanyInfo?.group,
                contacts: existingCompanyInfo?.contacts,
                // But allow any explicitly provided values to override
                ...updatedOffer.companyInfo
            },
            // Preserve the existing company description - it should only be modified from company page
            companyDescription: currentCompanyDescription
        };

        this.offers.update(offers =>
            offers.map(o =>
                o.id === offerWithCompanyId.id ? offerWithCompanyId : o
            )
        );
    }

    deleteOffer(id: number) {
        this.offers.update(offers => offers.filter(o => o.id !== id));
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

        if (companyOffers.length === 0) return null;

        // Return info from the most recently added offer as the source of truth
        const latestOffer = companyOffers.sort((a, b) =>
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
