import { Injectable, signal, computed, effect, untracked } from '@angular/core';
import { Task } from '../../tasks/task.model';
import { LocalStorageService } from './local-storage.service';
import { AuthService } from './auth.service';

@Injectable({
    providedIn: 'root'
})
export class TasksService {
    tasks = signal<Task[]>([]);

    constructor(
        private localStorageService: LocalStorageService,
        private authService: AuthService
    ) {
        // React to user changes to load correct data
        effect(() => {
            const user = this.authService.currentUser();
            if (user) {
                this.loadTasksFromStorage();
            } else {
                this.tasks.set([]);
            }
        }, { allowSignalWrites: true });

        // Set up auto-save effect
        effect(() => {
            const currentTasks = this.tasks();
            const user = untracked(() => this.authService.currentUser());

            if (user) {
                this.localStorageService.updateTasks(currentTasks);
            }
        });
    }

    /**
     * Load tasks from localStorage
     */
    private loadTasksFromStorage() {
        const tasks = this.localStorageService.getTasks();
        if (tasks && tasks.length > 0) {
            this.tasks.set(tasks);
        }
    }

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

    clearAll() {
        this.tasks.set([]);
    }
}
