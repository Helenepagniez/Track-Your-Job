import { Component, signal, computed } from '@angular/core';
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
    description?: string;
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

    // Search & Filter
    searchTerm = signal('');
    statusFilter = signal('');

    filteredOffers = computed(() => {
        const term = this.searchTerm().toLowerCase();
        const status = this.statusFilter();
        return this.offers().filter(offer => {
            const matchesTerm = offer.title.toLowerCase().includes(term) ||
                offer.company.toLowerCase().includes(term) ||
                offer.location.toLowerCase().includes(term);
            const matchesStatus = status ? offer.status === status : true;
            return matchesTerm && matchesStatus;
        });
    });

    // Add Modal State
    showAddModal = signal(false);
    newOffer: Partial<JobOffer> = {
        status: 'To Apply',
        dateAdded: new Date()
    };

    // Detail Modal State
    showDetailModal = signal(false);
    selectedOffer = signal<JobOffer | null>(null);

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

    // Modal Methods
    openAddModal() {
        this.newOffer = { status: 'To Apply', dateAdded: new Date() };
        this.showAddModal.set(true);
    }

    closeAddModal() {
        this.showAddModal.set(false);
    }

    submitOffer() {
        if (this.newOffer.title && this.newOffer.company) {
            const offer: JobOffer = {
                id: Date.now(),
                title: this.newOffer.title!,
                company: this.newOffer.company!,
                status: this.newOffer.status as any || 'To Apply',
                location: this.newOffer.location || 'Remote',
                salary: this.newOffer.salary,
                dateAdded: new Date(),
                description: this.newOffer.description,
                companyInfo: this.newOffer.companyInfo
            };
            this.offers.update(offers => [offer, ...offers]);
            this.closeAddModal();
        }
    }

    openDetailModal(offer: JobOffer) {
        this.selectedOffer.set(offer);
        this.showDetailModal.set(true);
    }

    closeDetailModal() {
        this.showDetailModal.set(false);
        this.selectedOffer.set(null);
    }
}
