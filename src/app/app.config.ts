import { ApplicationConfig, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';

import { registerLocaleData } from '@angular/common';
import localeFr from '@angular/common/locales/fr';
import {
  LOCALE_ID
} from '@angular/core';
import {
  MAT_DATE_LOCALE,
  provideNativeDateAdapter,
} from '@angular/material/core';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { provideFirebaseApp } from '@angular/fire/app';
import { provideAuth } from '@angular/fire/auth';
import { provideFirestore } from '@angular/fire/firestore';
import { getAuth } from 'firebase/auth';
import { routes } from './app.routes';
import { firebaseApp, firebaseFirestore } from './core/firebase.config';

registerLocaleData(localeFr);

export const appConfig: ApplicationConfig = {
  providers: [provideZoneChangeDetection({ eventCoalescing: true }), provideRouter(routes), provideAnimationsAsync(),
  provideNativeDateAdapter(),
  { provide: LOCALE_ID, useValue: 'fr-FR' },
  { provide: MAT_DATE_LOCALE, useValue: 'fr-FR' },

  // La configuration Firebase est publique ; ce sont les règles Firestore qui
  // protègent les données (voir firestore.rules).
  provideFirebaseApp(() => firebaseApp()),
  provideAuth(() => getAuth(firebaseApp())),
  provideFirestore(() => firebaseFirestore()),
  ]
};
