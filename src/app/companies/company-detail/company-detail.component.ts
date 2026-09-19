import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import {
    APPLICATION_STATUSES,
    Application,
    ApplicationStatus,
    Company,
    STATUS_LABELS,
    currentStatus,
    enteredStatusAt,
    interviewEvents,
    sentAt
} from '../../core/models/job-search.models';
import { statusClass } from '../../core/models/status-style';
import { JobSearchStore } from '../../core/services/job-search-store.service';
import { ContactDraft, ContactFormComponent } from '../../contacts/contact-form/contact-form.component';
import { CompanyDraft, CompanyFormComponent } from '../company-form/company-form.component';

interface ApplicationRow {
    id: number;
    title: string;
    status: ApplicationStatus;
    statusLabel: string;
    statusClass: string;
    meta: string;
}

interface HistoryRow {
    title: string;
    outcome: ApplicationStatus;
    outcomeLabel: string;
    outcomeClass: string;
    year: string;
}

interface ContactRow {
    id: number;
    fullName: string;
    initials: string;
    role: string;
    email: string;
    current: boolean;
}

@Component({
    selector: 'app-company-detail',
    standalone: true,
    imports: [CommonModule, RouterModule, CompanyFormComponent, ContactFormComponent],
    templateUrl: './company-detail.component.html',
    styleUrl: './company-detail.component.css'
})
export class CompanyDetailComponent {
    private route = inject(ActivatedRoute);
    private router = inject(Router);
    private store = inject(JobSearchStore);

    /** L'URL peut porter un identifiant ou, historiquement, un nom. */
    private identifier = signal<string>('');

    showCompanyForm = signal(false);
    showContactForm = signal(false);

    statusClass = statusClass;

    constructor() {
        this.route.paramMap.subscribe(params => {
            this.identifier.set(params.get('id') ?? '');
        });
    }

    company = computed<Company | undefined>(() => {
        const raw = this.identifier();
        if (!raw) return undefined;
        const asNumber = Number(raw);
        if (!isNaN(asNumber) && asNumber > 0) {
            return this.store.company(asNumber);
        }
        return this.store.companyByName(decodeURIComponent(raw));
    });

    applications = computed<Application[]>(() => {
        const company = this.company();
        return company ? this.store.applicationsOfCompany(company.id) : [];
    });

    rows = computed<ApplicationRow[]>(() =>
        this.applications()
            .map(application => {
                const status = currentStatus(application);
                return {
                    id: application.id,
                    title: application.title,
                    status,
                    statusLabel: STATUS_LABELS[status],
                    statusClass: statusClass(status),
                    meta: metaFor(application, status)
                };
            })
            .sort((a, b) => a.title.localeCompare(b.title, 'fr'))
    );

    history = computed<HistoryRow[]>(() => {
        const company = this.company();
        if (!company) return [];
        return [...company.history]
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(entry => ({
                title: entry.title,
                outcome: entry.outcome,
                outcomeLabel: STATUS_LABELS[entry.outcome],
                outcomeClass: statusClass(entry.outcome),
                year: String(new Date(entry.date).getFullYear())
            }));
    });

    contacts = computed<ContactRow[]>(() => {
        const company = this.company();
        if (!company) return [];
        return this.store.contactsOfCompany(company.id).map(contact => {
            const affiliation = contact.affiliations.find(entry => entry.companyId === company.id);
            return {
                id: contact.id,
                fullName: contact.fullName,
                initials: initials(contact.fullName),
                role: affiliation?.role ?? contact.role ?? '',
                email: contact.email ?? '',
                current: affiliation?.current ?? false
            };
        });
    });

    /** Compteurs toutes campagnes confondues : l'en cours et l'archivé. */
    badges = computed(() => {
        const counts = new Map<ApplicationStatus, number>();
        for (const application of this.applications()) {
            const status = currentStatus(application);
            counts.set(status, (counts.get(status) ?? 0) + 1);
        }
        for (const entry of this.history()) {
            counts.set(entry.outcome, (counts.get(entry.outcome) ?? 0) + 1);
        }
        return APPLICATION_STATUSES
            .filter(status => counts.has(status))
            .map(status => ({
                count: counts.get(status)!,
                label: STATUS_LABELS[status],
                className: statusClass(status)
            }));
    });

    summary = computed<string>(() => {
        const current = this.applications().length;
        const archived = this.history().length;
        const total = current + archived;

        if (total === 0) {
            return "Aucune candidature pour l'instant chez cette entreprise.";
        }

        const parts: string[] = [
            `${total} candidature${total > 1 ? 's' : ''} au total`
        ];
        if (current > 0) parts.push(`${current} sur la campagne en cours`);
        if (archived > 0) parts.push(`${archived} archivée${archived > 1 ? 's' : ''}`);
        return parts.join(', ') + '.';
    });

    meta = computed<string[]>(() => {
        const company = this.company();
        if (!company) return [];
        const parts: string[] = [];
        if (company.sector) parts.push(company.sector);
        if (company.employees !== undefined) parts.push(`${company.employees} salariés`);
        if (company.founded !== undefined) parts.push(`fondée en ${company.founded}`);
        if (company.group) parts.push(`groupe ${company.group}`);
        return parts;
    });

    // --------------------------------------------------------------- actions

    back(): void {
        this.router.navigate(['/entreprises']);
    }

    openApplication(row: ApplicationRow): void {
        this.router.navigate(['/offres', row.id]);
    }

    openCompanyForm(): void {
        this.showCompanyForm.set(true);
    }

    closeCompanyForm(): void {
        this.showCompanyForm.set(false);
    }

    /** Une seule écriture : plus rien n'est recopié sur les candidatures. */
    onSaveCompany(draft: CompanyDraft): void {
        const company = this.company();
        if (!company) return;
        this.store.updateCompany(company.id, {
            name: draft.name || company.name,
            sector: draft.sector,
            website: draft.website,
            employees: draft.employees,
            founded: draft.founded,
            group: draft.group,
            description: draft.description,
            notes: draft.notes,
            tags: draft.tags
        });
        this.closeCompanyForm();
    }

    openContactForm(): void {
        this.showContactForm.set(true);
    }

    closeContactForm(): void {
        this.showContactForm.set(false);
    }

    onSaveContact(draft: ContactDraft): void {
        const company = this.company();
        if (!company) return;

        const id = this.store.addContact({
            fullName: draft.fullName,
            role: draft.role,
            email: draft.email,
            phone: draft.phone,
            linkedin: draft.linkedin,
            notes: draft.notes,
            affiliations: []
        });
        this.store.attachContactToCompany(id, company.id, draft.role);
        this.closeContactForm();
    }

    openDirectory(): void {
        this.router.navigate(['/repertoire']);
    }
}

// --------------------------------------------------------------------------

function initials(name: string): string {
    const words = name.trim().split(/\s+/).filter(Boolean);
    if (words.length === 0) return '?';
    if (words.length === 1) return words[0].slice(0, 2).toUpperCase();
    return (words[0][0] + words[words.length - 1][0]).toUpperCase();
}

function shortDate(iso: string): string {
    return new Date(iso).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
}

function metaFor(application: Application, status: ApplicationStatus): string {
    const parts: string[] = [];
    if (application.contractType) parts.push(application.contractType);
    if (application.location) parts.push(application.location);

    const at = sentAt(application);
    if (at) parts.push(`envoyée le ${shortDate(at)}`);

    if (status === 'interview') {
        const next = interviewEvents(application).find(event => new Date(event.at) >= new Date());
        if (next) parts.push(`entretien le ${shortDate(next.at)}`);
    } else {
        const entered = enteredStatusAt(application, status);
        if (entered && at !== entered) {
            parts.push(`${STATUS_LABELS[status].toLowerCase()} le ${shortDate(entered)}`);
        }
    }

    return parts.join(' · ');
}
