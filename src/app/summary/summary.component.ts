import { Component, computed, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { OffersService } from '../core/services/offers.service';
import { TasksService } from '../core/services/tasks.service';

@Component({
    selector: 'app-summary',
    standalone: true,
    imports: [CommonModule, RouterModule],
    templateUrl: './summary.component.html',
    styleUrl: './summary.component.css'
})
export class SummaryComponent {
    private offersService = inject(OffersService);
    private tasksService = inject(TasksService);

    // Computed statistics based on real data
    stats = computed(() => {
        const offers = this.offersService.offers();
        const tasks = this.tasksService.tasks();

        // Count by status
        const appliedCount = offers.filter(o => o.status === 'Applied').length;
        const interviewCount = offers.filter(o => o.status === 'Interview').length;
        const rejectedCount = offers.filter(o => o.status === 'Rejected').length;
        const toApplyCount = offers.filter(o => o.status === 'To Apply').length;
        const toRelaunchCount = offers.filter(o => o.status === 'To Relaunch').length;
        const noResponseCount = offers.filter(o => o.status === 'No Response').length;

        // Total applications sent (Applied + Interview + Rejected + To Relaunch + No Response)
        const sentCount = appliedCount + interviewCount + rejectedCount + toRelaunchCount + noResponseCount;

        // Response rate (applications with response / total sent)
        const responsesCount = interviewCount + rejectedCount;
        const responseRate = sentCount > 0 ? Math.round((responsesCount / sentCount) * 100) : 0;

        // Unique companies
        const uniqueCompanies = new Set(offers.map(o => o.company)).size;

        // Remaining tasks (not completed)
        const remainingTasks = tasks.filter(t => !t.completed && t.status !== 'termine').length;

        return [
            { title: 'Candidatures envoyées', value: sentCount, icon: '📝' },
            { title: 'En attente', value: appliedCount, icon: '⏳' },
            { title: 'Entretiens', value: interviewCount, icon: '🤝' },
            { title: 'Refus', value: rejectedCount, icon: '❌' },
            { title: 'Taux de réponses', value: `${responseRate}%`, icon: '📊' },
            { title: 'A postuler', value: toApplyCount, icon: '🎯' },
            { title: 'Entreprises', value: uniqueCompanies, icon: '🏢' },
            { title: 'Tâches restantes', value: remainingTasks, icon: '📋' }
        ];
    });

    // Recent activities from tasks and offers
    recentActivities = computed(() => {
        const offers = this.offersService.offers();
        const tasks = this.tasksService.tasks();
        const activities: any[] = [];

        // Get recent applications (last 3 offers with status Applied or Interview)
        const recentOffers = [...offers]
            .filter(o => o.status === 'Applied' || o.status === 'Interview')
            .sort((a, b) => new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime())
            .slice(0, 2);

        recentOffers.forEach(offer => {
            const timeDiff = Date.now() - new Date(offer.dateAdded).getTime();
            const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
            const daysAgo = Math.floor(timeDiff / (1000 * 60 * 60 * 24));

            let dateStr = '';
            if (hoursAgo < 24) {
                dateStr = hoursAgo === 0 ? "Il y a moins d'une heure" : `Il y a ${hoursAgo} heure${hoursAgo > 1 ? 's' : ''}`;
            } else {
                dateStr = `Il y a ${daysAgo} jour${daysAgo > 1 ? 's' : ''}`;
            }

            activities.push({
                type: 'Candidature',
                company: offer.company,
                date: dateStr,
                status: this.offersService.getStatusLabel(offer.status)
            });
        });

        // Get upcoming interviews
        const upcomingInterviews = offers
            .filter(o => o.interviews && o.interviews.length > 0)
            .flatMap(o => o.interviews!.map(i => ({ ...i, offer: o })))
            .filter(i => new Date(i.date) > new Date())
            .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
            .slice(0, 1);

        upcomingInterviews.forEach(interview => {
            const interviewDate = new Date(interview.date);
            const today = new Date();
            const tomorrow = new Date(today);
            tomorrow.setDate(tomorrow.getDate() + 1);

            let dateStr = '';
            if (interviewDate.toDateString() === today.toDateString()) {
                dateStr = `Aujourd'hui à ${interviewDate.getHours()}h${interviewDate.getMinutes().toString().padStart(2, '0')}`;
            } else if (interviewDate.toDateString() === tomorrow.toDateString()) {
                dateStr = `Demain à ${interviewDate.getHours()}h${interviewDate.getMinutes().toString().padStart(2, '0')}`;
            } else {
                const daysUntil = Math.ceil((interviewDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                dateStr = `Dans ${daysUntil} jour${daysUntil > 1 ? 's' : ''}`;
            }

            activities.push({
                type: 'Entretien',
                company: interview.offer.company,
                date: dateStr,
                status: 'Prévu'
            });
        });

        // Get recent incomplete tasks
        const recentTasks = [...tasks]
            .filter(t => !t.completed)
            .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime())
            .slice(0, 1);

        recentTasks.forEach(task => {
            const taskDate = new Date(task.dueDate);
            const today = new Date();

            let dateStr = '';
            if (taskDate.toDateString() === today.toDateString()) {
                dateStr = "Aujourd'hui";
            } else if (taskDate < today) {
                dateStr = 'En retard';
            } else {
                const daysUntil = Math.ceil((taskDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
                dateStr = `Dans ${daysUntil} jour${daysUntil > 1 ? 's' : ''}`;
            }

            activities.push({
                type: 'Tâche',
                title: task.title,
                date: dateStr,
                status: task.status === 'a_faire' ? 'À faire' : task.status === 'en_cours' ? 'En cours' : 'Terminé'
            });
        });

        return activities.slice(0, 3);
    });

    // Chart data based on real offer counts
    chartData = computed(() => {
        const offers = this.offersService.offers();

        // Current month counts
        const appliedCount = offers.filter(o => o.status === 'Applied').length;
        const interviewCount = offers.filter(o => o.status === 'Interview').length;
        const rejectedCount = offers.filter(o => o.status === 'Rejected').length;
        const toRelaunchCount = offers.filter(o => o.status === 'To Relaunch').length;

        // Simulate previous month data (in a real app, this would come from historical data)
        // For now, we'll use a simple calculation: current - random variation
        const getPreviousMonthValue = (current: number) => {
            const variation = Math.floor(Math.random() * 3) - 1; // -1, 0, or 1
            return Math.max(0, current + variation);
        };

        return [
            { label: 'En attente', value: appliedCount, adjustment: getPreviousMonthValue(appliedCount) },
            { label: 'À relancer', value: toRelaunchCount, adjustment: getPreviousMonthValue(toRelaunchCount) },
            { label: 'Entretien', value: interviewCount, adjustment: getPreviousMonthValue(interviewCount) },
            { label: 'Refus', value: rejectedCount, adjustment: getPreviousMonthValue(rejectedCount) }
        ];
    });

    get maxChartValue(): number {
        const vals = this.chartData().map(d => Math.max(d.value, d.adjustment));
        return vals.length ? Math.max(...vals) + 2 : 10;
    }

    get polylinePoints(): string {
        const width = 400; // viewBox width
        const height = 200; // viewBox height
        const data = this.chartData();
        const step = width / data.length;

        return data.map((d, i) => {
            const x = i * step + step / 2;
            const y = height - (d.adjustment / this.maxChartValue) * height;
            return `${x},${y}`;
        }).join(' ');
    }
}
