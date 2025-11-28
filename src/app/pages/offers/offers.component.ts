import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { OffersService, JobOffer } from '../../core/services/offers.service';
import { OfferFormComponent } from '../../components/offer-form/offer-form.component';
import { MatMenuModule } from '@angular/material/menu';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

@Component({
    selector: 'app-offers',
    standalone: true,
    imports: [
        CommonModule,
        FormsModule,
        RouterModule,
        OfferFormComponent,
        MatMenuModule,
        MatIconModule,
        MatButtonModule
    ],
    templateUrl: './offers.component.html',
    styleUrl: './offers.component.css'
})
export class OffersComponent {
    private offersService = inject(OffersService);
    private router = inject(Router);

    offers = this.offersService.offers;

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

    // Modal State
    showAddModal = signal(false);
    editingOffer = signal<JobOffer | null>(null);
    showDeleteConfirm = signal(false);
    offerToDelete = signal<number | null>(null);

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

    // Navigation
    viewDetails(id: number) {
        this.router.navigate(['/dashboard/offers', id]);
    }

    // Modal Methods
    openAddModal(offer?: JobOffer) {
        if (offer) {
            this.editingOffer.set(offer);
        } else {
            this.editingOffer.set(null);
        }
        this.showAddModal.set(true);
    }

    closeAddModal() {
        this.showAddModal.set(false);
        this.editingOffer.set(null);
    }

    onSaveOffer(offerData: Partial<JobOffer>) {
        if (this.editingOffer()) {
            const updatedOffer: JobOffer = {
                ...this.editingOffer()!,
                ...offerData
            };
            this.offersService.updateOffer(updatedOffer);
        } else {
            const newOffer: JobOffer = {
                id: Date.now(),
                dateAdded: new Date(),
                title: offerData.title!,
                company: offerData.company!,
                status: offerData.status as any || 'To Apply',
                location: offerData.location || 'Remote',
                ...offerData
            } as JobOffer;
            this.offersService.addOffer(newOffer);
        }
        this.closeAddModal();
    }

    // Delete Logic
    confirmDelete(id: number, event: Event) {
        event.stopPropagation();
        this.offerToDelete.set(id);
        this.showDeleteConfirm.set(true);
    }

    cancelDelete() {
        this.showDeleteConfirm.set(false);
        this.offerToDelete.set(null);
    }

    deleteOffer() {
        if (this.offerToDelete()) {
            this.offersService.deleteOffer(this.offerToDelete()!);
            this.cancelDelete();
        }
    }
}
