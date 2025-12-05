import { Component, signal, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OffersService, JobOffer } from '../../core/services/offers.service';

interface CompanySummary {
    name: string;
    offerCount: number;
    contacts: any[]; // Using any for simplicity as defined in service
    latestOfferDate: Date;
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
                    name: offer.company,
                    offerCount: 0,
                    contacts: [],
                    latestOfferDate: new Date(0) // Epoch
                });
            }

            const summary = companyMap.get(offer.company)!;
            summary.offerCount++;

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

    viewDetails(companyName: string) {
        // Navigate to detail page. Encoding the name to handle spaces/special chars
        this.router.navigate(['/dashboard/companies', encodeURIComponent(companyName)]);
    }
}
