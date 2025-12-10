import { Component, inject, signal, OnInit, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { OffersService, JobOffer, StatusHistoryEntry, Interview } from '../../core/services/offers.service';
import { OfferFormComponent } from '../offer-form/offer-form.component';

@Component({
    selector: 'app-offer-detail',
    standalone: true,
    imports: [CommonModule, RouterModule, OfferFormComponent, FormsModule],
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
    showInterviewsModal = signal(false);
    showStatusHistoryModal = signal(false);

    // Delete confirmation states
    showDeleteInterviewConfirm = signal(false);
    interviewToDelete = signal<number | null>(null);
    showDeleteStatusConfirm = signal(false);
    statusToDelete = signal<number | null>(null);

    // Temp storage for editing
    editingInterviews: Interview[] = [];
    editingStatusHistory: StatusHistoryEntry[] = [];

    // For adding new items in modals
    newInterview: Interview = { date: new Date(), type: 'Entretien Visio' };
    newStatusEntry: StatusHistoryEntry = { status: 'Applied', date: new Date() };

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
            background: 'rgba(0, 153, 122, 0.2)',
            border: '2px solid #00997aff'
        },
        'Rejected': {
            color: '#d63031',
            background: 'rgba(214, 48, 49, 0.2)',
            border: '2px solid #d63031'
        }
    };

    possibleStatuses = ['To Apply', 'Applied', 'To Relaunch', 'No Response', 'Interview', 'Offer', 'Rejected'];
    interviewTypes: Interview['type'][] = ['Préqual', 'Entretien Physique', 'Entretien Téléphonique', 'Entretien Visio'];

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

    // Helper to convert Date to YYYY-MM-DD string for input[type="date"]
    dateToInputString(date: Date | string): string {
        const d = typeof date === 'string' ? new Date(date) : date;
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }

    // Helper to convert YYYY-MM-DD string to Date
    inputStringToDate(dateStr: string): Date {
        return new Date(dateStr);
    }

    isPastDate(date: Date | string): boolean {
        const d = new Date(date);
        const now = new Date();
        // Reset hours to compare dates only if needed, but for interviews time might matter.
        // Let's keep it simple: strict inequality
        return d < now;
    }

    // --- Edit Main Modal ---

    openEditModal() {
        this.showEditModal.set(true);
    }

    closeEditModal() {
        this.showEditModal.set(false);
    }

    onUpdateOffer(offerData: Partial<JobOffer>) {
        if (this.offer()) {
            const { statusHistory, ...offerWithoutHistory } = this.offer()!;
            const updatedOffer: JobOffer = {
                ...offerWithoutHistory,
                ...offerData
                // Don't include statusHistory - let the service manage it
            };
            this.offersService.updateOffer(updatedOffer);
            this.closeEditModal();
        }
    }

    // --- Delete Offer ---

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

    // --- Interviews Modal ---

    openInterviewsModal() {
        const o = this.offer();
        if (o) {
            // Clone interviews and convert dates to strings for input[type="date"]
            this.editingInterviews = o.interviews ? o.interviews.map(i => ({
                ...i,
                date: this.dateToInputString(i.date) as any
            })) : [];
            // If legacy interviewDate exists but no interviews array, migrate it
            if (this.editingInterviews.length === 0 && o.interviewDate && o.interviewType) {
                this.editingInterviews.push({
                    date: this.dateToInputString(o.interviewDate) as any,
                    type: o.interviewType
                });
            }
            this.newInterview = { date: this.dateToInputString(new Date()) as any, type: 'Entretien Visio' };
            this.showInterviewsModal.set(true);
        }
    }

    closeInterviewsModal() {
        this.showInterviewsModal.set(false);
    }

    addInterview() {
        this.editingInterviews.push({ ...this.newInterview });
        this.newInterview = { date: this.dateToInputString(new Date()) as any, type: 'Entretien Visio' }; // Reset
    }

    confirmDeleteInterview(index: number) {
        this.interviewToDelete.set(index);
        this.showDeleteInterviewConfirm.set(true);
    }

    cancelDeleteInterview() {
        this.showDeleteInterviewConfirm.set(false);
        this.interviewToDelete.set(null);
    }

    removeInterview() {
        if (this.interviewToDelete() !== null) {
            this.editingInterviews.splice(this.interviewToDelete()!, 1);
            this.showDeleteInterviewConfirm.set(false);
            this.interviewToDelete.set(null);
        }
    }

    saveInterviews() {
        if (this.offer()) {
            // Convert string dates back to Date objects
            const interviewsWithDates = this.editingInterviews.map(i => ({
                ...i,
                date: this.inputStringToDate(i.date as any)
            }));

            // Sort by date descending
            interviewsWithDates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            const updatedOffer: JobOffer = {
                ...this.offer()!,
                interviews: interviewsWithDates
            };

            // Sync legacy fields for compatibility
            // Find upcoming interview
            const now = new Date();
            const upcoming = interviewsWithDates.filter(i => new Date(i.date) >= now).sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())[0];

            if (upcoming) {
                updatedOffer.interviewDate = upcoming.date;
                updatedOffer.interviewType = upcoming.type;
            } else if (interviewsWithDates.length > 0) {
                // No upcoming, take the latest past
                const latest = interviewsWithDates[0]; // already sorted desc
                updatedOffer.interviewDate = latest.date;
                updatedOffer.interviewType = latest.type;
            } else {
                updatedOffer.interviewDate = undefined;
                updatedOffer.interviewType = undefined;
            }

            this.offersService.updateOffer(updatedOffer);
            this.closeInterviewsModal();
        }
    }

    // --- Status History Modal ---

    openStatusHistoryModal() {
        const o = this.offer();
        if (o) {
            // Clone, sort by date descending, and convert dates to strings
            this.editingStatusHistory = o.statusHistory ?
                [...o.statusHistory]
                    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                    .map(entry => ({
                        ...entry,
                        date: this.dateToInputString(entry.date) as any
                    })) : [];
            this.newStatusEntry = { status: 'Applied', date: this.dateToInputString(new Date()) as any };
            this.showStatusHistoryModal.set(true);
        }
    }

    closeStatusHistoryModal() {
        this.showStatusHistoryModal.set(false);
    }

    addStatusHistory() {
        this.editingStatusHistory.push({ ...this.newStatusEntry });
        this.newStatusEntry = { status: 'Applied', date: this.dateToInputString(new Date()) as any };
    }

    confirmDeleteStatus(index: number) {
        this.statusToDelete.set(index);
        this.showDeleteStatusConfirm.set(true);
    }

    cancelDeleteStatus() {
        this.showDeleteStatusConfirm.set(false);
        this.statusToDelete.set(null);
    }

    removeStatusHistory() {
        if (this.statusToDelete() !== null) {
            this.editingStatusHistory.splice(this.statusToDelete()!, 1);
            this.showDeleteStatusConfirm.set(false);
            this.statusToDelete.set(null);
        }
    }

    saveStatusHistory() {
        if (this.offer()) {
            // Convert string dates back to Date objects
            const historyWithDates = this.editingStatusHistory.map(entry => ({
                ...entry,
                date: this.inputStringToDate(entry.date as any)
            }));

            // Sort by date descending (most recent first)
            historyWithDates.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            // Get the most recent status (first after sorting)
            const mostRecentStatus = historyWithDates.length > 0 ? historyWithDates[0].status : this.offer()!.status;

            const updatedOffer: JobOffer = {
                ...this.offer()!,
                statusHistory: historyWithDates,
                status: mostRecentStatus as any // Sync current status with most recent history entry
            };
            this.offersService.updateOffer(updatedOffer);
            this.closeStatusHistoryModal();
        }
    }

    getUpcomingInterviews(interviews: Interview[]): Interview[] {
        const now = new Date();
        return interviews
            .filter(i => new Date(i.date) >= now)
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()); // Soonest first
    }

    getPastInterviews(interviews: Interview[]): Interview[] {
        const now = new Date();
        return interviews
            .filter(i => new Date(i.date) < now)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()); // Most recent first
    }

    getSortedStatusHistory(history: StatusHistoryEntry[]): StatusHistoryEntry[] {
        return [...history].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }

    viewCompany(offer: JobOffer) {
        if (offer.companyInfo?.id) {
            this.router.navigate(['/entreprises', offer.companyInfo.id]);
        } else {
            this.router.navigate(['/entreprises', offer.company]);
        }
    }
}
