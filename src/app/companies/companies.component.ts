import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import {
    APPLICATION_STATUSES,
    Application,
    ApplicationStatus,
    Company,
    Contact,
    NO_COMPANY_LABEL,
    STATUS_LABELS,
    currentStatus
} from '../core/models/job-search.models';
import { statusClass } from '../core/models/status-style';
import { JobSearchStore } from '../core/services/job-search-store.service';
import { CompanyDraft, CompanyFormComponent } from './company-form/company-form.component';

interface StatusBadge {
    count: number;
    label: string;
    className: string;
}

interface CompanyCard {
    id: number;
    name: string;
    initials: string;
    sector: string;
    website: string;
    applicationCount: number;
    contactCount: number;
    /** Candidatures des campagnes clôturées, résumées sur la fiche. */
    historyCount: number;
    badges: StatusBadge[];
    lastActivity: number;
}

@Component({
    selector: 'app-companies',
    standalone: true,
    imports: [CommonModule, RouterModule, FormsModule, CompanyFormComponent],
    templateUrl: './companies.component.html',
    styleUrl: './companies.component.css'
})
export class CompaniesComponent {
    private store = inject(JobSearchStore);
    private router = inject(Router);

    searchTerm = signal('');
    sectorFilter = signal('');

    showFormModal = signal(false);
    showDeleteConfirm = signal(false);
    toDelete = signal<CompanyCard | null>(null);

    sectors = computed(() => {
        const found = new Set<string>();
        for (const company of this.store.companies()) {
            if (company.sector) found.add(company.sector);
        }
        return [...found].sort((a, b) => a.localeCompare(b, 'fr'));
    });

    private cards = computed<CompanyCard[]>(() => {
        const applications = this.store.applications();
        const contacts = this.store.contacts();
        return this.store.companies()
            .map(company => toCard(company, applications, contacts))
            .sort((a, b) => b.lastActivity - a.lastActivity || a.name.localeCompare(b.name, 'fr'));
    });

    filtered = computed<CompanyCard[]>(() => {
        const term = this.searchTerm().trim().toLowerCase();
        const sector = this.sectorFilter();
        return this.cards().filter(card => {
            if (sector && card.sector !== sector) return false;
            if (!term) return true;
            return card.name.toLowerCase().includes(term) || card.sector.toLowerCase().includes(term);
        });
    });

    total = computed(() => this.cards().length);
    contactTotal = computed(() => this.store.contacts().length);

    hasFilters = computed(() => !!this.searchTerm() || !!this.sectorFilter());

    // --------------------------------------------------------------- actions

    open(card: CompanyCard): void {
        this.router.navigate(['/entreprises', card.id]);
    }

    openForm(): void {
        this.showFormModal.set(true);
    }

    closeForm(): void {
        this.showFormModal.set(false);
    }

    onSave(draft: CompanyDraft): void {
        if (!draft.name) return;
        const id = this.store.ensureCompany(draft.name, {
            sector: draft.sector,
            website: draft.website,
            employees: draft.employees,
            founded: draft.founded,
            group: draft.group,
            description: draft.description,
            notes: draft.notes,
            tags: draft.tags
        });
        this.closeForm();
        if (id !== null) {
            this.router.navigate(['/entreprises', id]);
        }
    }

    askDelete(card: CompanyCard, event: MouseEvent): void {
        event.stopPropagation();
        this.toDelete.set(card);
        this.showDeleteConfirm.set(true);
    }

    cancelDelete(): void {
        this.showDeleteConfirm.set(false);
        this.toDelete.set(null);
    }

    confirmDelete(): void {
        const card = this.toDelete();
        if (card) {
            this.store.deleteCompany(card.id);
        }
        this.cancelDelete();
    }

    resetFilters(): void {
        this.searchTerm.set('');
        this.sectorFilter.set('');
    }
}

// --------------------------------------------------------------------------

function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[1][0]).toUpperCase();
}

function toCard(company: Company, applications: Application[], contacts: Contact[]): CompanyCard {
    const own = applications.filter(application => application.companyId === company.id);

    const counts = new Map<ApplicationStatus, number>();
    for (const application of own) {
        const status = currentStatus(application);
        counts.set(status, (counts.get(status) ?? 0) + 1);
    }

    const badges: StatusBadge[] = APPLICATION_STATUSES
        .filter(status => counts.has(status))
        .map(status => ({
            count: counts.get(status)!,
            label: STATUS_LABELS[status],
            className: statusClass(status)
        }));

    const lastActivity = own.reduce(
        (latest, application) => Math.max(latest, new Date(application.createdAt).getTime()),
        new Date(company.createdAt).getTime()
    );

    return {
        id: company.id,
        name: company.name,
        initials: initials(company.name),
        sector: company.sector ?? '',
        website: company.website ?? '',
        applicationCount: own.length,
        contactCount: contacts.filter(contact =>
            contact.affiliations.some(affiliation => affiliation.companyId === company.id)
        ).length,
        historyCount: company.history.length,
        badges,
        lastActivity
    };
}
