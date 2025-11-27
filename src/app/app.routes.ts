import { Routes } from '@angular/router';
import { LandingComponent } from './pages/landing/landing.component';
import { LoginComponent } from './pages/auth/login/login.component';
import { RegisterComponent } from './pages/auth/register/register.component';
import { DashboardComponent } from './pages/dashboard/dashboard.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    { path: '', component: LandingComponent },
    { path: 'auth/login', component: LoginComponent },
    { path: 'auth/register', component: RegisterComponent },
    {
        path: 'dashboard',
        component: DashboardComponent,
        canActivate: [authGuard],
        children: [
            {
                path: '',
                loadComponent: () => import('./pages/dashboard/summary/summary.component').then(m => m.SummaryComponent)
            },
            {
                path: 'offers',
                loadComponent: () => import('./pages/offers/offers.component').then(m => m.OffersComponent)
            },
            {
                path: 'tasks',
                loadComponent: () => import('./pages/tasks/tasks.component').then(m => m.TasksComponent)
            },
            {
                path: 'stats',
                loadComponent: () => import('./pages/stats/stats.component').then(m => m.StatsComponent)
            },
            {
                path: 'profile',
                loadComponent: () => import('./pages/profile/profile.component').then(m => m.ProfileComponent)
            }
        ]
    },
    { path: '**', redirectTo: '' }
];
