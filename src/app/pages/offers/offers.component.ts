import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

interface JobOffer {
    id: number;
    title: string;
    company: string;
    status: 'To Apply' | 'Applied' | 'Interview' | 'Offer' | 'Rejected';
    location: string;
    salary?: string;
    dateAdded: Date;
    companyInfo?: {
        employees?: number;
        founded?: number;
        group?: string;
    };
}

@Component({
    selector: 'app-offers',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './offers.component.html',
    styleUrl: './offers.component.css'
})
export class OffersComponent {
    offers = signal<JobOffer[]>([
        {
            id: 1,
            title: 'Senior Angular Developer',
            company: 'Tech Solutions Inc.',
            status: 'Interview',
            location: 'Paris, France',
            salary: '60k - 75k €',
            dateAdded: new Date('2023-10-25'),
            companyInfo: { employees: 500, founded: 2010 }
        },
        {
            id: 2,
            title: 'Frontend Engineer',
            company: 'Creative Agency',
            status: 'Applied',
            location: 'Remote',
            dateAdded: new Date('2023-11-01')
        },
        {
            id: 3,
            title: 'Full Stack Developer',
            company: 'Startup Nation',
            status: 'To Apply',
            location: 'Lyon, France',
            dateAdded: new Date('2023-11-05')
        }
    ]);

    statusColors: Record<string, string> = {
        'To Apply': 'var(--text-secondary)',
        'Applied': 'var(--primary-color)',
        'Interview': 'var(--warning-color)',
        'Offer': 'var(--success-color)',
        'Rejected': 'var(--danger-color)'
    };

    getStatusLabel(status: string): string {
        const labels: Record<string, string> = {
            'To Apply': 'À postuler',
            'Applied': 'En attente',
            'Interview': 'Entretien',
            'Offer': 'Offre reçue',
            'Rejected': 'Refusé'
        };
        return labels[status] || status;
    }
}
