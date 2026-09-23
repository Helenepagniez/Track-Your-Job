import { ApplicationConfig, LOCALE_ID, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import { provideFirebaseApp } from '@angular/fire/app';
import { provideAuth } from '@angular/fire/auth';
import { provideFirestore } from '@angular/fire/firestore';
import { provideFunctions } from '@angular/fire/functions';
import { getAuth } from 'firebase/auth';
import { routes } from './app.routes';
import { firebaseApp, firebaseFirestore, firebaseFunctions } from './core/firebase.config';

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [
    provideZoneChangeDetection({ eventCoalescing: true }),
    provideRouter(routes),
    { provide: LOCALE_ID, useValue: 'fr-FR' },

    // La configuration Firebase est publique ; ce sont les règles Firestore qui
    // protègent les données (voir firestore.rules).
    provideFirebaseApp(() => firebaseApp()),
    provideAuth(() => getAuth(firebaseApp())),
    provideFirestore(() => firebaseFirestore()),
    provideFunctions(() => firebaseFunctions()),
  ]
};
