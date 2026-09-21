import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppComponent } from './app.component';
import { AuthService } from './core/services/auth.service';
import { JobSearchStore } from './core/services/job-search-store.service';

/**
 * Le composant racine dépend de Firebase par l'intermédiaire de
 * l'authentification et du magasin de données. On les remplace par des doubles
 * : ce test vérifie le composant, pas la connexion à Firebase, et il doit
 * tourner sans réseau.
 */
const authStub = {
  ready: signal(false),
  isAuthenticated: signal(false),
  currentUser: signal(null),
  whenReady: () => Promise.resolve(),
};

const storeStub = {
  ready: signal(false),
  syncError: signal(''),
};

describe('AppComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: authStub },
        { provide: JobSearchStore, useValue: storeStub },
      ],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app).toBeTruthy();
  });

  it(`should have the 'track-your-job' title`, () => {
    const fixture = TestBed.createComponent(AppComponent);
    const app = fixture.componentInstance;
    expect(app.title).toEqual('track-your-job');
  });

  it('affiche l\u2019\u00e9cran de chargement tant que Firebase n\u2019a pas r\u00e9pondu', () => {
    const fixture = TestBed.createComponent(AppComponent);
    fixture.detectChanges();
    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Chargement de votre espace');
  });
});
