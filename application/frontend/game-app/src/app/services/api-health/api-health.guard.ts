import { inject } from '@angular/core';
import { CanActivateFn } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiHealthService } from './api-health.service';

/**
 * A page using the APIs shows once they are up, the app telling meanwhile it connects, then boots them: its requests
 * then reach the database awake
 */
export const apiHealthGuard: CanActivateFn = (): Observable<true> => inject(ApiHealthService).ensureUp();
