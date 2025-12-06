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

    getStatusBadges(): Array<{ count: number, label: string, color: string, background: string, status: string, border: string }> {
        const data = this.companyData();
        if (!data) return [];

        const statusLabels: { [key: string]: string } = {
            'To Apply': 'à postuler',
            'Applied': 'en attente',
            'Interview': 'en entretien',
            'Offer': 'reçue',
            'Rejected': 'refusé'
        };

        const statusCounts: Record<string, number> = {};
        data.offers.forEach(o => {
            statusCounts[o.status] = (statusCounts[o.status] || 0) + 1;
        });

        const badges: Array<{ count: number, label: string, color: string, background: string, status: string, border: string }> = [];

        (Object.keys(statusCounts) as Array<keyof typeof statusCounts>).forEach(status => {
            const count = statusCounts[status];
            if (count > 0) {
                badges.push({
                    count,
                    label: statusLabels[status],
                    color: this.statusColors[status].color,
                    background: this.statusColors[status].background,
                    border: this.statusColors[status].border,
                    status
                });
            }
        });

        return badges;
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
