import { Component, signal, computed, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { OffersService, JobOffer } from '../../core/services/offers.service';
import { CompanyFormComponent } from '../company-form/company-form.component';

@Component({
    selector: 'app-company-detail',
    standalone: true,
    imports: [CommonModule, RouterModule, CompanyFormComponent],
    templateUrl: './company-detail.component.html',
    styleUrl: './company-detail.component.css'
})
export class CompanyDetailComponent implements OnInit {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private offersService = inject(OffersService);

    identifier = signal<string | number>('');

    // Computed Company Data
    companyData = computed(() => {
        const id = this.identifier();
        if (!id) return null;
        return this.offersService.getCompany(id);
    });

    // Valid company name from loaded data
    companyName = computed(() => this.companyData()?.name ?? '');

    // Stats Computed
    stats = computed(() => {
        const data = this.companyData();
        if (!data) return null;

        const total = data.offers.length;
        const statusCounts: Record<string, number> = {};

        data.offers.forEach(o => {
            statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
        });

        // Format for display text
        const details = Object.entries(statusCounts)
            .map(([status, count]) => `${count} ${this.getStatusLabel(status)}`)
            .join(', ');

        return {
            total,
            details
        };
    });

    showEditModal = signal(false);

    statusColors: Record<string, string> = {
        'To Apply': 'var(--text-secondary)',
        'Applied': 'var(--primary-color)',
        'Interview': 'var(--warning-color)',
        'Offer': 'var(--success-color)',
        'Rejected': 'var(--danger-color)'
    };

    ngOnInit() {
        this.route.paramMap.subscribe(params => {
            const idParam = params.get('id');
            if (idParam) {
                // Check if it's a numeric ID
                const id = Number(idParam);
                if (!isNaN(id) && id > 0) {
                    this.identifier.set(id);
                } else {
                    this.identifier.set(decodeURIComponent(idParam));
                }
            }
        });
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

    onSaveCompany(newData: any) {
        const name = this.companyName();
        if (name) {
            this.offersService.updateCompanyDetails(name, newData);
            this.closeEditModal();
        }
    }

    viewOffer(id: number) {
        this.router.navigate(['/offres', id]);
    }
}
