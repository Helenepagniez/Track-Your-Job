import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OffersService, JobOffer } from '../core/services/offers.service';

interface CompanySummary {
    id?: number;
    name: string;
    offerCount: number;
    contacts: any[];
    latestOfferDate: Date;
    statusCounts: {
        'To Apply': number;
        'Applied': number;
        'Interview': number;
        'Offer': number;
        'Rejected': number;
        'To Relaunch': number;
        'No Response': number;
    };
}

@Component({
    selector: 'app-companies',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule],
    templateUrl: './companies.component.html',
    styleUrl: './companies.component.css'
})
export class CompaniesComponent {
    private offersService = inject(OffersService);
    private router = inject(Router);

    searchTerm = signal('');

    // Computed list of companies derived from offers
    companies = computed(() => {
        const offers = this.offersService.offers();
        const companyMap = new Map<string, CompanySummary>();

        offers.forEach(offer => {
            if (!companyMap.has(offer.company)) {
                companyMap.set(offer.company, {
                    id: offer.companyInfo?.id,
                    name: offer.company,
                    offerCount: 0,
                    contacts: [],
                    latestOfferDate: new Date(0), // Epoch
                    statusCounts: {
                        'To Apply': 0,
                        'Applied': 0,
                        'Interview': 0,
                        'Offer': 0,
                        'Rejected': 0,
                        'To Relaunch': 0,
                        'No Response': 0
                    }
                });
            } else {
                // Should we try to find an ID if the previous one was undefined?
                const existing = companyMap.get(offer.company)!;
                if (!existing.id && offer.companyInfo?.id) {
                    existing.id = offer.companyInfo.id;
                }
            }

            const summary = companyMap.get(offer.company)!;
            summary.offerCount++;
            summary.statusCounts[offer.status]++;

            // Collect contacts if any
            if (offer.companyInfo?.contacts) {
                // Merge unique contacts
                const existingNames = new Set(summary.contacts.map(c => c.name));
                offer.companyInfo.contacts.forEach(c => {
                    if (!existingNames.has(c.name)) {
                        summary.contacts.push(c);
                        existingNames.add(c.name);
                    }
                });
            }

            // Update latest date
            const offerDate = new Date(offer.dateAdded);
            if (offerDate > summary.latestOfferDate) {
                summary.latestOfferDate = offerDate;
            }
        });

        // Filter and Sort
        const term = this.searchTerm().toLowerCase();
        return Array.from(companyMap.values())
            .filter(c => c.name.toLowerCase().includes(term))
            .sort((a, b) => b.latestOfferDate.getTime() - a.latestOfferDate.getTime());
    });

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

    viewDetails(company: CompanySummary) {
        if (company.id) {
            this.router.navigate(['/entreprises', company.id]);
        } else {
            // Navigate to detail page. Encoding the name to handle spaces/special chars
            this.router.navigate(['/entreprises', company.name]); // No need to encodeURIComponent here, the router usually handles it or it's cleaner to let router handle URL construction
        }
    }

    getStatusBreakdown(company: CompanySummary): string {
        const statusLabels: { [key: string]: string } = {
            'To Apply': 'à postuler',
            'Applied': 'en attente',
            'To Relaunch': 'à relancer',
            'No Response': 'sans réponse',
            'Interview': ' en entretien',
            'Offer': ' reçue',
            'Rejected': 'refusé'
        };

        const parts: string[] = [];

        (Object.keys(company.statusCounts) as Array<keyof typeof company.statusCounts>).forEach(status => {
            const count = company.statusCounts[status];
            if (count > 0) {
                parts.push(`${count} ${statusLabels[status]}`);
            }
        });

        return parts.join(', ');
    }

    getStatusBadges(company: CompanySummary): Array<{ count: number, label: string, color: string, background: string, status: string, border: string }> {
        const statusLabels: { [key: string]: string } = {
            'To Apply': 'à postuler',
            'Applied': 'en attente',
            'To Relaunch': 'à relancer',
            'No Response': 'sans réponse',
            'Interview': 'en entretien',
            'Offer': ' reçue',
            'Rejected': 'refusé'
        };

        const badges: Array<{ count: number, label: string, color: string, background: string, status: string, border: string }> = [];

        (Object.keys(company.statusCounts) as Array<keyof typeof company.statusCounts>).forEach(status => {
            const count = company.statusCounts[status];
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
}
