import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import {
    Application,
    Campaign,
    CampaignSummary,
    computeCampaignStats,
    countAnsweredIn,
    countEnteredStatus,
    countSentIn
} from '../core/models/job-search.models';
import { JobSearchStore } from '../core/services/job-search-store.service';

interface Kpi {
    label: string;
    value: string;
    note: string;
    tone: 'neutral' | 'good' | 'warn';
}

interface Bar {
    x: number;
    y: number;
    height: number;
    series: string;
}

interface MonthChart {
    width: number;
    height: number;
    baseline: number;
    max: number;
    gridY: number[];
    bars: Bar[];
    labels: { x: number; text: string }[];
}

interface FunnelStep {
    label: string;
    count: number;
    width: number;
    rate: string;
    className: string;
}

interface SourceRow {
    source: string;
    sent: number;
    answered: number;
    rate: number;
    width: number;
    tone: 'good' | 'mid' | 'low';
}

interface SectorRow {
    sector: string;
    count: number;
    share: number;
}

const SERIES = [
    { key: 'sent', label: 'envoyées' },
    { key: 'answered', label: 'réponses' },
    { key: 'interview', label: 'entretiens' },
    { key: 'rejected', label: 'refus' }
];

const CHART_WIDTH = 640;
const PLOT_LEFT = 40;
const PLOT_RIGHT = 620;
const PLOT_TOP = 10;
const BASELINE = 180;
const MONTHS = 6;

/**
 * Statistiques de la recherche.
 *
 * Tous les chiffres sont comptés sur des événements datés : le chiffre d'un
 * mois passé ne bouge plus jamais. Une campagne clôturée affiche le résumé figé
 * à sa clôture, puisque ses candidatures ont été effacées.
 */
@Component({
    selector: 'app-statistics',
    standalone: true,
    imports: [CommonModule, FormsModule, RouterModule],
    templateUrl: './statistics.component.html',
    styleUrl: './statistics.component.css'
})
export class StatisticsComponent {
    private store = inject(JobSearchStore);

    /** Campagne consultée ; vide = celle en cours. */
    selectedCampaignId = signal<number | ''>('');

    readonly series = SERIES;

    campaigns = computed<Campaign[]>(() =>
        [...this.store.campaigns()].sort((a, b) =>
            new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
    );

    activeCampaign = computed(() => this.store.activeCampaign());

    campaign = computed<Campaign | null>(() => {
        const id = this.selectedCampaignId();
        if (id === '') return this.activeCampaign();
        return this.campaigns().find(entry => entry.id === id) ?? null;
    });

    isArchived = computed(() => this.campaign()?.status === 'closed');

    /** Candidatures de la campagne consultée, vides si elle est clôturée. */
    private applications = computed<Application[]>(() => {
        const campaign = this.campaign();
        if (!campaign) return [];
        return this.store.applications().filter(app => app.campaignId === campaign.id);
    });

    /** Chiffres : calculés en direct, ou lus dans le résumé figé. */
    stats = computed<CampaignSummary | null>(() => {
        const campaign = this.campaign();
        if (!campaign) return null;
        if (campaign.status === 'closed') return campaign.summary ?? null;
        return computeCampaignStats(
            this.applications(),
            campaign.startedAt,
            new Date().toISOString()
        );
    });

    hasData = computed(() => (this.stats()?.applications ?? 0) > 0);

    kpis = computed<Kpi[]>(() => {
        const stats = this.stats();
        const campaign = this.campaign();
        if (!stats || !campaign) return [];

        const responseRate = stats.sent > 0 ? Math.round((stats.answered / stats.sent) * 100) : 0;
        const perInterview = stats.interviews > 0
            ? (stats.sent / stats.interviews).toFixed(1).replace('.', ',')
            : null;

        const days = Math.max(1, Math.round(
            (new Date(stats.to).getTime() - new Date(stats.from).getTime()) / 86400000
        ));
        const perDay = (stats.sent / days).toFixed(1).replace('.', ',');
        const goal = campaign.weeklyGoal;

        return [
            {
                label: 'Candidatures envoyées',
                value: String(stats.sent),
                note: `sur ${stats.applications} repérée${stats.applications > 1 ? 's' : ''}`,
                tone: 'neutral'
            },
            {
                label: 'Taux de réponse',
                value: `${responseRate} %`,
                note: `${stats.answered} réponse${stats.answered > 1 ? 's' : ''} obtenue${stats.answered > 1 ? 's' : ''}`,
                tone: responseRate >= 30 ? 'good' : responseRate > 0 ? 'warn' : 'neutral'
            },
            {
                label: 'Entretiens',
                value: String(stats.interviews),
                note: perInterview ? `1 pour ${perInterview} envois` : 'aucun pour l\'instant',
                tone: stats.interviews > 0 ? 'good' : 'neutral'
            },
            {
                label: 'Délai de réponse médian',
                value: stats.medianResponseDays !== null ? `${stats.medianResponseDays} j` : '—',
                note: 'au-delà de 35 j : classée sans réponse',
                tone: 'neutral'
            },
            {
                label: 'Rythme',
                value: `${perDay} / j`,
                note: goal ? `objectif : ${goal} / semaine` : `sur ${days} jour${days > 1 ? 's' : ''}`,
                tone: 'neutral'
            }
        ];
    });

    /** Histogramme mensuel : seulement pour la campagne en cours. */
    chart = computed<MonthChart | null>(() => {
        if (this.isArchived()) return null;
        const applications = this.applications();
        if (applications.length === 0) return null;

        const months: { from: Date; to: Date; label: string }[] = [];
        const now = new Date();
        for (let offset = MONTHS - 1; offset >= 0; offset--) {
            const from = new Date(now.getFullYear(), now.getMonth() - offset, 1);
            const to = new Date(now.getFullYear(), now.getMonth() - offset + 1, 0, 23, 59, 59, 999);
            months.push({
                from,
                to,
                label: from.toLocaleDateString('fr-FR', { month: 'short' })
            });
        }

        const values = months.map(month => ({
            sent: countSentIn(applications, month.from, month.to),
            answered: countAnsweredIn(applications, month.from, month.to),
            interview: countEnteredStatus(applications, 'interview', month.from, month.to),
            rejected: countEnteredStatus(applications, 'rejected', month.from, month.to)
        }));

        const peak = Math.max(1, ...values.flatMap(entry => Object.values(entry)));
        const max = peak <= 4 ? 4 : Math.ceil(peak / 2) * 2;

        const plotWidth = PLOT_RIGHT - PLOT_LEFT;
        const plotHeight = BASELINE - PLOT_TOP;
        const groupWidth = plotWidth / months.length;
        const barWidth = 16;
        const gap = 4;
        const clusterWidth = SERIES.length * barWidth + (SERIES.length - 1) * gap;
        const offset = (groupWidth - clusterWidth) / 2;

        const bars: Bar[] = [];
        const labels: { x: number; text: string }[] = [];

        months.forEach((month, index) => {
            const groupX = PLOT_LEFT + index * groupWidth;
            labels.push({ x: groupX + groupWidth / 2, text: month.label });

            SERIES.forEach((serie, serieIndex) => {
                const value = (values[index] as Record<string, number>)[serie.key];
                const height = (value / max) * plotHeight;
                bars.push({
                    x: groupX + offset + serieIndex * (barWidth + gap),
                    y: BASELINE - Math.max(height, value > 0 ? 2 : 1.5),
                    height: Math.max(height, value > 0 ? 2 : 1.5),
                    series: serie.key
                });
            });
        });

        return {
            width: CHART_WIDTH,
            height: 214,
            baseline: BASELINE,
            max,
            gridY: [BASELINE, PLOT_TOP + plotHeight / 2, PLOT_TOP],
            bars,
            labels
        };
    });

    funnel = computed<FunnelStep[]>(() => {
        const stats = this.stats();
        if (!stats || stats.applications === 0) return [];

        const total = stats.applications;
        const pct = (value: number) => Math.round((value / total) * 100);

        return [
            {
                label: `${total} repérée${total > 1 ? 's' : ''}`,
                count: total, width: 100, rate: '100 %', className: 'st-to_apply'
            },
            {
                label: `${stats.sent} envoyée${stats.sent > 1 ? 's' : ''}`,
                count: stats.sent, width: Math.max(pct(stats.sent), 6),
                rate: `${pct(stats.sent)} %`, className: 'st-sent'
            },
            {
                label: `${stats.answered} réponse${stats.answered > 1 ? 's' : ''}`,
                count: stats.answered, width: Math.max(pct(stats.answered), 6),
                rate: stats.sent > 0 ? `${Math.round((stats.answered / stats.sent) * 100)} % des envois` : '—',
                className: 'st-interview'
            },
            {
                label: `${stats.interviews} entretien${stats.interviews > 1 ? 's' : ''}`,
                count: stats.interviews, width: Math.max(pct(stats.interviews), 6),
                rate: stats.answered > 0
                    ? `${Math.round((stats.interviews / stats.answered) * 100)} % des réponses`
                    : '—',
                className: 'st-offer'
            },
            {
                label: `${stats.offers} offre${stats.offers > 1 ? 's' : ''}`,
                count: stats.offers, width: Math.max(pct(stats.offers), 6),
                rate: stats.interviews > 0
                    ? `${Math.round((stats.offers / stats.interviews) * 100)} % des entretiens`
                    : '—',
                className: 'st-offer'
            }
        ];
    });

    /** La plus grosse perte du parcours, nommée. */
    leak = computed<string>(() => {
        const stats = this.stats();
        if (!stats || stats.applications === 0) return '';

        const neverSent = stats.applications - stats.sent;
        if (neverSent > 0 && neverSent >= stats.sent - stats.answered) {
            return `${neverSent} offre${neverSent > 1 ? 's' : ''} repérée${neverSent > 1 ? 's' : ''} `
                + `n'${neverSent > 1 ? 'ont' : 'a'} jamais été envoyée${neverSent > 1 ? 's' : ''}. `
                + `C'est là que la fuite est la plus grosse.`;
        }

        const silent = stats.sent - stats.answered;
        if (silent > 0) {
            return `${silent} candidature${silent > 1 ? 's' : ''} `
                + `${silent > 1 ? 'sont restées' : 'est restée'} sans réponse. `
                + `La fuite est à l'étape « envoyée → réponse ».`;
        }

        return 'Toutes vos candidatures ont reçu une réponse.';
    });

    sources = computed<SourceRow[]>(() => {
        const stats = this.stats();
        if (!stats) return [];
        return stats.bySource.map(entry => {
            const rate = entry.sent > 0 ? Math.round((entry.answered / entry.sent) * 100) : 0;
            return {
                source: entry.source,
                sent: entry.sent,
                answered: entry.answered,
                rate,
                width: Math.max(rate, 2),
                tone: rate >= 40 ? 'good' : rate >= 20 ? 'mid' : 'low'
            };
        });
    });

    sectors = computed<SectorRow[]>(() => {
        const applications = this.applications();
        if (applications.length === 0) return [];

        const counts = new Map<string, number>();
        for (const application of applications) {
            const company = this.store.company(application.companyId);
            const sector = company?.sector?.trim() || 'Non renseigné';
            counts.set(sector, (counts.get(sector) ?? 0) + 1);
        }

        return [...counts.entries()]
            .map(([sector, count]) => ({
                sector,
                count,
                share: Math.round((count / applications.length) * 100)
            }))
            .sort((a, b) => b.count - a.count);
    });

    /** Lecture arithmétique des chiffres, pas une interprétation. */
    insight = computed<string>(() => {
        const stats = this.stats();
        if (!stats || stats.sent === 0) return '';

        const ranked = this.sources().filter(source => source.sent >= 2);
        if (ranked.length < 2) {
            return `Il faut quelques candidatures de plus par source pour pouvoir les comparer.`;
        }

        const best = ranked[0];
        const worst = ranked[ranked.length - 1];
        const share = Math.round((best.sent / stats.sent) * 100);

        if (best.rate === worst.rate) {
            return `Vos sources se valent pour l'instant : ${best.rate} % de réponses de part et d'autre.`;
        }

        const factor = worst.rate > 0
            ? `${(best.rate / worst.rate).toFixed(1).replace('.', ',')} fois`
            : 'nettement';

        return `« ${best.source} » vous répond ${factor} mieux que « ${worst.source} » `
            + `(${best.rate} % contre ${worst.rate} %), mais ne représente que ${share} % de vos envois.`;
    });

    relaunch = computed(() => {
        const stats = this.stats();
        return {
            sent: stats?.relaunched ?? 0,
            answered: stats?.relaunchesAnswered ?? 0
        };
    });

    periodLabel = computed<string>(() => {
        const stats = this.stats();
        if (!stats) return '';
        const from = new Date(stats.from).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
        const to = this.isArchived()
            ? new Date(stats.to).toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' })
            : "aujourd'hui";
        return `${from} → ${to}`;
    });
}
