import { TestBed } from '@angular/core/testing';

import { BlockRoomService } from './block-room.service';

describe('BlockRoomService', () => {
  let service: BlockRoomService<never>;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(BlockRoomService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
