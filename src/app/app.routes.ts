import { Routes } from '@angular/router';
import { LandingComponent } from './landing/landing.component';
import { LoginComponent } from './auth/login/login.component';
import { RegisterComponent } from './auth/register/register.component';
import { authGuard } from './core/guards/auth.guard';

export const routes: Routes = [
    { path: '', component: LandingComponent },
    { path: 'auth/login', component: LoginComponent },
    { path: 'auth/register', component: RegisterComponent },
    {
        path: 'summary',
        canActivate: [authGuard],
        loadComponent: () => import('./summary/summary.component').then(m => m.SummaryComponent)
    },
    {
        path: 'offers',
        canActivate: [authGuard],
        loadComponent: () => import('./offers/offers.component').then(m => m.OffersComponent)
    },
    {
        path: 'offers/:id',
        canActivate: [authGuard],
        loadComponent: () => import('./offers/offer-detail/offer-detail.component').then(m => m.OfferDetailComponent)
    },
    {
        path: 'companies',
        canActivate: [authGuard],
        loadComponent: () => import('./companies/companies.component').then(m => m.CompaniesComponent)
    },
    {
        path: 'companies/:id',
        canActivate: [authGuard],
        loadComponent: () => import('./companies/company-detail/company-detail.component').then(m => m.CompanyDetailComponent)
    },
    {
        path: 'tasks',
        canActivate: [authGuard],
        loadComponent: () => import('./tasks/tasks.component').then(m => m.TasksComponent)
    },
    {
        path: 'profile',
        canActivate: [authGuard],
        loadComponent: () => import('./profile/profile.component').then(m => m.ProfileComponent)
    },
    { path: '**', redirectTo: '' }
];
