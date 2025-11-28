import { Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { OffersService, JobOffer } from '../../../core/services/offers.service';
import { OfferFormComponent } from '../../../components/offer-form/offer-form.component';

@Component({
    selector: 'app-offer-detail',
    standalone: true,
    imports: [CommonModule, RouterModule, OfferFormComponent],
    templateUrl: './offer-detail.component.html',
    styleUrl: './offer-detail.component.css'
})
export class OfferDetailComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private offersService = inject(OffersService);

    offer = signal<JobOffer | undefined>(undefined);
    showEditModal = signal(false);
    showDeleteConfirm = signal(false);

    statusColors: Record<string, string> = {
        'To Apply': 'var(--text-secondary)',
        'Applied': 'var(--primary-color)',
        'Interview': 'var(--warning-color)',
        'Offer': 'var(--success-color)',
        'Rejected': 'var(--danger-color)'
    };

    ngOnInit() {
        this.route.paramMap.subscribe(params => {
            const id = Number(params.get('id'));
            if (id) {
                this.loadOffer(id);
            }
        });
    }

    loadOffer(id: number) {
        const foundOffer = this.offersService.getOffer(id);
        if (foundOffer) {
            this.offer.set(foundOffer);
        } else {
            this.router.navigate(['/dashboard/offers']);
        }
    }

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

    openEditModal() {
        this.showEditModal.set(true);
    }

    closeEditModal() {
        this.showEditModal.set(false);
    }

    onUpdateOffer(offerData: Partial<JobOffer>) {
        if (this.offer()) {
            const updatedOffer: JobOffer = {
                ...this.offer()!,
                ...offerData
            };
            this.offersService.updateOffer(updatedOffer);
            this.offer.set(updatedOffer);
            this.closeEditModal();
        }
    }

    confirmDelete() {
        this.showDeleteConfirm.set(true);
    }

    cancelDelete() {
        this.showDeleteConfirm.set(false);
    }

    deleteOffer() {
        if (this.offer()) {
            this.offersService.deleteOffer(this.offer()!.id);
            this.router.navigate(['/dashboard/offers']);
        }
    }
}
