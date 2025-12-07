import { Injectable, signal, computed } from '@angular/core';
import { Task } from '../../tasks/task.model';

@Injectable({
    providedIn: 'root'
})
export class TasksService {
    tasks = signal<Task[]>([
        {
            id: 1,
            title: 'Relancer Tech Solutions Inc.',
            dueDate: new Date('2025-11-30'),
            completed: false,
            status: 'a_faire',
            relatedOffers: ['Senior Angular Developer - Tech Solutions Inc. - Entretien'],
            priority: 'haute'
        },
        {
            id: 2,
            title: 'Mettre à jour le CV',
            dueDate: new Date('2025-12-01'),
            completed: false,
            status: 'en_cours',
            priority: 'moyenne'
        },
        {
            id: 3,
            title: 'Rechercher des infos sur Creative Agency',
            dueDate: new Date('2025-11-28'),
            completed: true,
            status: 'termine',
            relatedOffers: ['Frontend Engineer - Creative Agency - En attente'],
            priority: 'faible'
        }
    ]);

    addTask(task: Task) {
        this.tasks.update(tasks => [task, ...tasks]);
    }

    setTasks(tasks: Task[]) {
        this.tasks.set(tasks);
    }

    updateTask(updatedTask: Task) {
        this.tasks.update(tasks => tasks.map(t => t.id === updatedTask.id ? updatedTask : t));
    }

    deleteTask(id: number) {
        this.tasks.update(tasks => tasks.filter(t => t.id !== id));
    }

    toggleTask(id: number) {
        this.tasks.update(tasks =>
            tasks.map(t => {
                if (t.id === id) {
                    const newCompleted = !t.completed;
                    return {
                        ...t,
                        completed: newCompleted,
                        status: newCompleted ? 'termine' : 'a_faire'
                    };
                }
                return t;
            })
        );
    }

    updateTaskStatus(id: number, newStatus: 'a_faire' | 'en_cours' | 'termine') {
        this.tasks.update(tasks =>
            tasks.map(t => t.id === id ? { ...t, status: newStatus, completed: newStatus === 'termine' } : t)
        );
    }
}
