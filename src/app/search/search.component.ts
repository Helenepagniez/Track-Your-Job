import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { FavoriteOffer } from '../core/models/job-search.models';
import { JobSearchCriteria, JobSearchResult } from '../core/parsing/france-travail';
import { JobSearchApiService } from '../core/services/job-search-api.service';
import { JobSearchStore } from '../core/services/job-search-store.service';

/** Départements de la région, pour ne pas taper un code de tête. */
const DEPARTMENTS: { code: string; label: string }[] = [
    { code: '', label: 'Partout en France' },
    { code: '35', label: 'Ille-et-Vilaine (35)' },
    { code: '22', label: 'Côtes-d\'Armor (22)' },
    { code: '29', label: 'Finistère (29)' },
    { code: '56', label: 'Morbihan (56)' },
    { code: '44', label: 'Loire-Atlantique (44)' },
    { code: '49', label: 'Maine-et-Loire (49)' },
    { code: '53', label: 'Mayenne (53)' },
    { code: '72', label: 'Sarthe (72)' },
    { code: '75', label: 'Paris (75)' }
];

const CONTRACT_TYPES = ['CDI', 'CDD', 'Intérim', 'Alternance', 'Freelance'];

const PERIODS: { days: number; label: string }[] = [
    { days: 0, label: 'Peu importe' },
    { days: 1, label: 'Depuis hier' },
    { days: 3, label: '3 derniers jours' },
    { days: 7, label: 'Cette semaine' },
    { days: 14, label: '15 derniers jours' },
    { days: 31, label: 'Ce mois-ci' }
];

const PAGE_SIZE = 20;

/**
 * Recherche d'offres et favoris.
 *
 * Les offres viennent de l'API France Travail, par l'intermédiaire d'une
 * fonction Firebase. Une offre mise de côté n'est pas une candidature : elle
 * attend dans les favoris, et devient une candidature d'un clic.
 */
@Component({
    selector: 'app-search',
    standalone: true,
    imports: [CommonModule, FormsModule],
    templateUrl: './search.component.html',
    styleUrl: './search.component.css'
})
export class SearchComponent {
    private api = inject(JobSearchApiService);
    private store = inject(JobSearchStore);
    private router = inject(Router);

    readonly departments = DEPARTMENTS;
    readonly contractTypes = CONTRACT_TYPES;
    readonly periods = PERIODS;

    // ------------------------------------------------------------- critères

    keywords = signal('');
    department = signal('35');
    selectedContracts = signal<string[]>([]);
    period = signal(0);
    alternanceOnly = signal(false);

    // ------------------------------------------------------------ résultats

    tab = signal<'results' | 'favorites'>('results');
    searching = signal(false);
    searched = signal(false);
    results = signal<JobSearchResult[]>([]);
    total = signal<number | undefined>(undefined);
    error = signal('');
    needsSetup = signal(false);
    openOffer = signal<string | null>(null);

    favorites = computed(() => this.store.favorites());
    favoriteCount = computed(() => this.favorites().length);

    /** Ce que l'utilisateur cherche, tel qu'envoyé à l'API. */
    private criteria(from = 0): JobSearchCriteria {
        return {
            keywords: this.keywords().trim() || undefined,
            department: this.department() || undefined,
            contractTypes: this.selectedContracts().length > 0 ? this.selectedContracts() : undefined,
            publishedWithinDays: this.period() || undefined,
            alternanceOnly: this.alternanceOnly() || undefined,
            from,
            limit: PAGE_SIZE
        };
    }

    async search(): Promise<void> {
        if (this.searching()) return;

        this.searching.set(true);
        this.error.set('');
        this.needsSetup.set(false);
        this.tab.set('results');

        const outcome = await this.api.search(this.criteria());
        this.searching.set(false);
        this.searched.set(true);

        if (!outcome.ok) {
            this.results.set([]);
            this.total.set(undefined);
            this.error.set(outcome.message ?? 'La recherche a échoué.');
            this.needsSetup.set(!!outcome.needsSetup);
            return;
        }

        this.results.set(outcome.offers);
        this.total.set(outcome.total);
    }

    /** Page suivante : les résultats s'ajoutent à la liste. */
    async more(): Promise<void> {
        if (this.searching()) return;

        this.searching.set(true);
        const outcome = await this.api.search(this.criteria(this.results().length));
        this.searching.set(false);

        if (!outcome.ok) {
            this.error.set(outcome.message ?? 'La recherche a échoué.');
            return;
        }
        this.results.update(current => [...current, ...outcome.offers]);
    }

    get hasMore(): boolean {
        const total = this.total();
        return total !== undefined && this.results().length < total;
    }

    // -------------------------------------------------------------- filtres

    toggleContract(type: string): void {
        this.selectedContracts.update(current =>
            current.includes(type)
                ? current.filter(entry => entry !== type)
                : [...current, type]
        );
    }

    isContractSelected(type: string): boolean {
        return this.selectedContracts().includes(type);
    }

    resetFilters(): void {
        this.keywords.set('');
        this.department.set('');
        this.selectedContracts.set([]);
        this.period.set(0);
        this.alternanceOnly.set(false);
    }

    // -------------------------------------------------------------- favoris

    isFavorite(id: string): boolean {
        return this.store.isFavorite(id);
    }

    toggleFavorite(offer: JobSearchResult): void {
        if (this.isFavorite(offer.id)) {
            this.store.removeFavorite(offer.id);
            return;
        }

        this.store.addFavorite({
            sourceId: offer.id,
            source: 'France Travail',
            title: offer.title,
            company: offer.company,
            location: offer.location,
            contractType: offer.contractType,
            salary: offer.salary,
            link: offer.link,
            excerpt: offer.excerpt
        });
    }

    removeFavorite(favorite: FavoriteOffer): void {
        this.store.removeFavorite(favorite.sourceId);
    }

    // ---------------------------------------------------- vers une candidature

    /**
     * Crée la candidature à partir de l'offre, puis ouvre sa fiche. Le favori
     * garde le lien vers la candidature née de lui.
     */
    apply(offer: JobSearchResult): void {
        const id = this.store.addApplication({
            title: offer.title,
            companyName: offer.company,
            location: offer.location,
            contractType: offer.contractType,
            weeklyHours: offer.weeklyHours,
            salary: offer.salary,
            source: 'France Travail',
            link: offer.link,
            posting: offer.description ? { description: offer.description } : undefined,
            status: 'to_apply'
        });

        if (this.isFavorite(offer.id)) {
            this.store.linkFavorite(offer.id, id);
        } else {
            this.store.addFavorite({
                sourceId: offer.id,
                source: 'France Travail',
                title: offer.title,
                company: offer.company,
                location: offer.location,
                contractType: offer.contractType,
                salary: offer.salary,
                link: offer.link,
                excerpt: offer.excerpt,
                applicationId: id
            });
        }

        void this.router.navigate(['/offres', id]);
    }

    /** Une candidature depuis un favori mis de côté plus tôt. */
    applyFromFavorite(favorite: FavoriteOffer): void {
        const id = this.store.addApplication({
            title: favorite.title,
            companyName: favorite.company,
            location: favorite.location,
            contractType: favorite.contractType,
            salary: favorite.salary,
            source: favorite.source,
            link: favorite.link,
            status: 'to_apply'
        });

        this.store.linkFavorite(favorite.sourceId, id);
        void this.router.navigate(['/offres', id]);
    }

    // --------------------------------------------------------------- détail

    toggleDetail(id: string): void {
        this.openOffer.update(current => (current === id ? null : id));
    }

    /** Âge de l'annonce, en mots. */
    publishedLabel(offer: JobSearchResult): string {
        if (!offer.publishedAt) return '';

        const days = Math.floor(
            (Date.now() - new Date(offer.publishedAt).getTime()) / 86_400_000
        );
        if (isNaN(days) || days < 0) return '';
        if (days === 0) return 'aujourd\'hui';
        if (days === 1) return 'hier';
        if (days < 7) return 'il y a ' + days + ' jours';
        if (days < 14) return 'la semaine dernière';
        return 'il y a ' + Math.floor(days / 7) + ' semaines';
    }
}
