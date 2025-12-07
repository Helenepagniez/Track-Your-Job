import { Component, EventEmitter, Input, Output, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Task } from '../task.model';
import { OffersService, JobOffer } from '../../core/services/offers.service';

@Component({
    selector: 'app-task-form',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './task-form.component.html',
    styleUrl: './task-form.component.css'
})
export class TaskFormComponent implements OnInit {
    @Input() task: Task | null = null;
    @Output() save = new EventEmitter<Partial<Task>>();
    @Output() cancel = new EventEmitter<void>();

    private offersService = inject(OffersService);

    formData: Partial<Task> = {
        priority: 'moyenne',
        status: 'a_faire',
        dueDate: new Date(),
        relatedOffers: []
    };

    searchTerm = '';
    showSuggestions = false;
    filteredOffers: JobOffer[] = [];

    ngOnInit() {
        if (this.task) {
            this.formData = { ...this.task };
            // Ensure date is a Date object if it comes as string
            if (this.formData.dueDate) {
                this.formData.dueDate = new Date(this.formData.dueDate);
            }
        }
        if (!this.formData.relatedOffers) {
            this.formData.relatedOffers = [];
        }
    }

    onSearchInput() {
        const term = this.searchTerm.toLowerCase();
        if (term.length > 0) {
            this.filteredOffers = this.offersService.offers().filter(offer => {
                const titleWords = offer.title.toLowerCase().split(' ');
                // Check if any word starts with the search term
                return titleWords.some(word => word.startsWith(term));
            });
            this.showSuggestions = true;
        } else {
            this.showSuggestions = false;
        }
    }

    getOfferLabel(offer: JobOffer): string {
        const clientStatus = this.translateStatus(offer.status);
        return `${offer.title} - ${offer.company} - ${clientStatus}`;
    }

    translateStatus(status: string): string {
        const statusMap: Record<string, string> = {
            'To Apply': 'À postuler',
            'Applied': 'En attente',
            'To Relaunch': 'À relancer',
            'No Response': 'Sans réponse',
            'Interview': 'Entretien',
            'Offer': 'Offre reçue',
            'Rejected': 'Refusé'
        };
        return statusMap[status] || status;
    }

    selectOffer(offer: JobOffer) {
        const offerString = this.getOfferLabel(offer);
        if (!this.formData.relatedOffers) {
            this.formData.relatedOffers = [];
        }
        if (!this.formData.relatedOffers.includes(offerString)) {
            this.formData.relatedOffers.push(offerString);
        }
        this.searchTerm = '';
        this.showSuggestions = false;
    }

    removeOffer(index: number) {
        this.formData.relatedOffers?.splice(index, 1);
    }

    // Allow clicking on suggestions
    onBlur() {
        // dynamic timeout to allow click event to register
        setTimeout(() => {
            this.showSuggestions = false;
        }, 200);
    }

    onSubmit() {
        if (this.formData.title) {
            this.save.emit(this.formData);
        }
    }

    onCancel() {
        this.cancel.emit();
    }
}
