import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { OffersService, JobOffer } from '../../core/services/offers.service';
import { OfferFormComponent } from '../offer-form/offer-form.component';

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

    offerId = signal<number | null>(null);

    offer = computed(() => {
        const id = this.offerId();
        if (!id) return undefined;
        return this.offersService.offers().find(o => o.id === id);
    });

    showEditModal = signal(false);
    showDeleteConfirm = signal(false);

    statusColors: Record<string, { color: string, background: string, border: string }> = {
        'To Apply': {
            color: '#4d5457ff',
            background: 'rgba(99, 110, 114, 0.2)',
            border: '2px solid #4d5457ff'
        },
        'Applied': {
            color: '#0056b3',
            background: 'rgba(0, 87, 179, 0.2)',
            border: '2px solid #0056b3'
        },
        'To Relaunch': {
            color: '#e67e22',
            background: 'rgba(230, 126, 34, 0.2)',
            border: '2px solid #e67e22'
        },
        'No Response': {
            color: '#754600ff',
            background: 'rgba(117, 70, 0, 0.2)',
            border: '2px solid #754600ff'
        },
        'Interview': {
            color: '#ffbb00ff',
            background: 'rgba(255, 196, 0, 0.18)',
            border: '2px solid #ffbb00ff'
        },
        'Offer': {
            color: '#00997aff',
            background: 'rgba(3, 211, 169, 0.2)',
            border: '2px solid #00997aff'
        },
        'Rejected': {
            color: '#d63031',
            background: 'rgba(214, 48, 49, 0.2)',
            border: '2px solid #d63031'
        }
    };

    ngOnInit() {
        this.route.paramMap.subscribe(params => {
            const id = Number(params.get('id'));
            if (id) {
                this.offerId.set(id);
            }
        });
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
            this.router.navigate(['/offres']);
        }
    }

    viewCompany(offer: JobOffer) {
        if (offer.companyInfo?.id) {
            this.router.navigate(['/entreprises', offer.companyInfo.id]);
        } else {
            this.router.navigate(['/entreprises', offer.company]);
        }
    }
}
