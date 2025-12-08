import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

@Component({
    selector: 'app-summary',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './summary.component.html',
    styleUrl: './summary.component.css'
})
export class SummaryComponent {
    stats = [
        { title: 'Candidatures envoyées', value: 12, icon: '📝' },
        { title: 'En attente', value: 5, icon: '⏳' },
        { title: 'Entretiens', value: 3, icon: '🤝' },
        { title: 'Refus', value: 2, icon: '❌' },
        { title: 'Taux de réponses', value: '15%', icon: '📊' },
        { title: 'A postuler', value: 5, icon: '🎯' },
        { title: 'Entreprises', value: 5, icon: '🏢' }
    ];

    recentActivities = [
        { type: 'Candidature', company: 'Google', date: 'Il y a 2 heures', status: 'Envoyé' },
        { type: 'Entretien', company: 'Amazon', date: 'Demain à 14h', status: 'Prévu' },
        { type: 'Tâche', title: 'Relancer Microsoft', date: 'Aujourd\'hui', status: 'En attente' }
    ];

    chartData = [
        { label: 'Envoyé', value: 12, adjustment: 8 },
        { label: 'En attente', value: 5, adjustment: 3 },
        { label: 'Entretien', value: 3, adjustment: 5 },
        { label: 'Refus', value: 2, adjustment: 1 }
    ];

    get maxChartValue(): number {
        const vals = this.chartData.map(d => Math.max(d.value, d.adjustment));
        return vals.length ? Math.max(...vals) + 2 : 10;
    }

    get polylinePoints(): string {
        const width = 400; // viewBox width
        const height = 200; // viewBox height
        const step = width / this.chartData.length;

        return this.chartData.map((d, i) => {
            const x = i * step + step / 2;
            const y = height - (d.adjustment / this.maxChartValue) * height;
            return `${x},${y}`;
        }).join(' ');
    }
}
