import { TestBed } from '@angular/core/testing';

import { RoomApiService } from './room-api.service';

describe('RoomApiService', () => {
  beforeEach(() => TestBed.configureTestingModule({}));

  it('should be created', () => {
    const service: RoomApiService = TestBed.inject(RoomApiService);
    expect(service).toBeTruthy();
  });
});
