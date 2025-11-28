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
        employees?: number;
        founded?: number;
        group?: string;
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
            companyInfo: { employees: 500, founded: 2010 }
        },
        {
            id: 2,
            title: 'Frontend Engineer',
            company: 'Creative Agency',
            status: 'Applied',
            location: 'Remote',
            dateAdded: new Date('2023-11-01'),
            description: 'Join our creative team to build stunning web experiences.'
        },
        {
            id: 3,
            title: 'Full Stack Developer',
            company: 'Startup Nation',
            status: 'To Apply',
            location: 'Lyon, France',
            dateAdded: new Date('2023-11-05'),
            description: 'Full stack role using Angular and Node.js.'
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
}
