import { Injectable, signal, computed } from '@angular/core';

export interface JobOffer {
    id: number;
    title: string;
    company: string;
    status: 'To Apply' | 'Applied' | 'Interview' | 'Offer' | 'Rejected';
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
            companyInfo: { id: 1, employees: 500, founded: 2010 }
        },
        {
            id: 2,
            title: 'Frontend Engineer',
            company: 'Creative Agency',
            status: 'Applied',
            location: 'Remote',
            dateAdded: new Date('2023-11-01'),
            description: 'Join our creative team to build stunning web experiences.',
            companyInfo: { id: 2 }
        },
        {
            id: 3,
            title: 'Full Stack Developer',
            company: 'Startup Nation',
            status: 'To Apply',
            location: 'Lyon, France',
            dateAdded: new Date('2023-11-05'),
            description: 'Full stack role using Angular and Node.js.',
            companyInfo: { id: 3 }
        }
    ]);

    getOffer(id: number): JobOffer | undefined {
        return this.offers().find(o => o.id === id);
    }

    addOffer(offer: JobOffer) {
        this.offers.update(offers => [offer, ...offers]);
    }

    updateOffer(updatedOffer: JobOffer) {
        this.offers.update(offers => offers.map(o =>
            o.id === updatedOffer.id ? updatedOffer : o
        ));
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
            info: latestOffer.companyInfo || {},
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
