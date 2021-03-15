import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormGroup } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { Subject } from 'rxjs';
import { takeUntil } from 'rxjs/operators';
import { APIUtils } from '../APIs/API-utils';
import { TheGamesDBAPIService } from '../APIs/TheGamesDB/TheGamesDBAPI.service';
import { GameImage, GamesDictionary, GamesImagesDictionary, GETGameImagesByGameIdRequest, GETGameImagesByGameIdResponse, GETGamesByPlatformIdRequest, GETGamesByPlatformIdResponse, GETPlatformsRequest, GETPlatformsResponse, ImageBaseUrlMeta, PlatformsDictionary } from '../APIs/TheGamesDB/TheGamesDBAPIEntities';
import { TheGamesDBAPIFormMapper } from '../APIs/TheGamesDB/TheGamesDBAPIFormMapper';
import { TheGamesDBAPIKey } from '../APIs/TheGamesDB/TheGamesDBAPIKey';
import { AlertDialogComponent } from '../shared/components/alert-dialog/alert-dialog.component';
import { DropdownOption } from '../shared/form-helpers/entities/dropdown-option';
import { DownloadImagesService } from '../shared/services/ipc-services/download-images.service';
import { ApiInterfaceGroupName, ApiInterfaceScreenOneFormService } from './services/api-interface-screen-one-form.service';
import { GameSelectionControlName } from './services/form-data/game-selection-form-data';
import { GameImageTypeSelectionControlName } from './services/form-data/image-selection-form-data';

@Component({
  selector: 'api-interface-screen-one',
  templateUrl: './api-interface-screen-one.component.html',
  styleUrls: ['./api-interface-screen-one.component.sass'],
  providers: [DownloadImagesService]
})
export class ApiInterfaceScreenOneComponent implements OnInit, OnDestroy {

  formGroup = ApiInterfaceScreenOneFormService.getNewFormGroup();

  platformsDictionary: PlatformsDictionary = {};
  gamesDictionary: GamesDictionary = {};
  gamesImagesDictionary: GamesImagesDictionary = {};

  imageBaseUrls: ImageBaseUrlMeta;
  selectedIconUrl: string;
  selectedBannerUrl: string;

  isDownloadButtonDisabled: boolean = true; // TODO: this component may not be the right place for this...

  // Expose to DOM
  ApiInterfaceGroupName = ApiInterfaceGroupName;
  GameSelectionControlName = GameSelectionControlName;
  GameImageTypeSelectionControlName = GameImageTypeSelectionControlName;

  private stop$ = new Subject<void>();

  constructor(
    private dialog: MatDialog,
    private theGamesDbAPIService: TheGamesDBAPIService,
    private downloadImagesService: DownloadImagesService
  ) { }

  ngOnInit() {
    // Form Pipeline
    this.fetchPlatforms();

    this.formGroup.get(ApiInterfaceGroupName.GameSelection)
                  .get(GameSelectionControlName.Platform)
                  .valueChanges
      .pipe(takeUntil(this.stop$))
      .subscribe((value) => {
        // Fetch domain data for next input
        let platformId = this.formGroup.get(ApiInterfaceGroupName.GameSelection)
                                        .get(GameSelectionControlName.Platform)
                                        .value?.Value.id;
        this.fetchGames(platformId);

        // Progressive Disclosure
        (!!value)
          ? this.formGroup.get(ApiInterfaceGroupName.GameSelection).get(GameSelectionControlName.Game).enable()
          : this.formGroup.get(ApiInterfaceGroupName.GameSelection).get(GameSelectionControlName.Game).disable();
        if (!value) this.formGroup.get(ApiInterfaceGroupName.GameSelection).get(GameSelectionControlName.Game).reset();
      });

    this.formGroup.get(ApiInterfaceGroupName.GameSelection)
                  .get(GameSelectionControlName.Game)
                  .valueChanges
      .pipe(takeUntil(this.stop$))
      .subscribe((value) => {
        // Fetch domain data for next input
        let gameId = this.formGroup.get(ApiInterfaceGroupName.GameSelection)
                                    .get(GameSelectionControlName.Game)
                                    .value?.Value.id;
        this.fetchGamesImages(gameId);

        // Progressive Disclosure
        (!!value)
          ? this.formGroup.get(ApiInterfaceGroupName.ImageTypeSelection).enable()
          : this.formGroup.get(ApiInterfaceGroupName.ImageTypeSelection).disable();
        if (!value) this.formGroup.get(ApiInterfaceGroupName.ImageTypeSelection).reset();
      });

    this.formGroup.get(ApiInterfaceGroupName.ImageTypeSelection)
                  .valueChanges
      .pipe(takeUntil(this.stop$))
      .subscribe(({icon, banner}) => {
        // Progressive Disclosure
        this.isDownloadButtonDisabled = !(!!icon || !!banner); // TODO: there's a clearer way to do this check

        // Side Effects
        this.selectedIconUrl = (!!icon)
          ? APIUtils.buildFileUrl(this.imageBaseUrls?.thumb, icon?.Value?.filename)
          : '';
        this.selectedBannerUrl = (!!banner) 
          ? APIUtils.buildFileUrl(this.imageBaseUrls?.thumb, banner?.Value?.filename)
          : '';
      });
  }

  ngOnDestroy() {
    this.stop$.next();
    this.stop$.complete();
  }

  fetchPlatforms() {
    let request: GETPlatformsRequest = {
      apikey: TheGamesDBAPIKey
    };

    this.theGamesDbAPIService.getAllPlatforms(request)
      .pipe(takeUntil(this.stop$))
      .subscribe((response: GETPlatformsResponse) => {
        // Store response data
        if (response?.data?.count) {
          this.platformsDictionary = response.data.platforms;
        }
      }, (error) => {
        this.openAlertDialog(error);
      });
  }

  fetchGames(platformSelectionId: number) {
    if (!!platformSelectionId) {
      let request: GETGamesByPlatformIdRequest = {
        apikey: TheGamesDBAPIKey,
        id: platformSelectionId.toString()
      }
      this.theGamesDbAPIService.getGamesByPlatformId(request)
        .pipe(takeUntil(this.stop$))
        .subscribe((response: GETGamesByPlatformIdResponse) => {
          // Store response data
          if (response?.data?.count) {
            this.gamesDictionary = response.data.games;
          }
        }, (error) => {
          this.openAlertDialog(error);
        });
    }
  }

  fetchGamesImages(gameSelectionId: number) {
    if (gameSelectionId) {
      let request: GETGameImagesByGameIdRequest = {
        apikey: TheGamesDBAPIKey,
        games_id: gameSelectionId.toString()
      }
      this.theGamesDbAPIService.getGameImagesByGameIdRequest(request)
        .pipe(takeUntil(this.stop$))
        .subscribe((response: GETGameImagesByGameIdResponse) => {
          // Store response data
          if (response?.data?.count) {
            this.gamesImagesDictionary = response.data.images;
          }

          // Side effects
          this.imageBaseUrls = response?.data?.base_url;
        }, (error) => {
          this.openAlertDialog(error);
        });
    }
  }

  downloadImages() {
    let filesToDownload = [];
    let iconGameImage: GameImage = this.formGroup.get(ApiInterfaceGroupName.ImageTypeSelection)
                                                  .get(GameImageTypeSelectionControlName.Icon)
                                                  ?.value?.Value;
    let bannerGameImage: GameImage = this.formGroup.get(ApiInterfaceGroupName.ImageTypeSelection)
                                                    .get(GameImageTypeSelectionControlName.Banner)
                                                    ?.value?.Value;
    if (iconGameImage?.id) {
      let fileToDownload = TheGamesDBAPIFormMapper.MapGameImageToFileToDownload(this.imageBaseUrls, iconGameImage, 'icon');
      filesToDownload.push(fileToDownload);
    }
    if (bannerGameImage?.id) {
      let fileToDownload = TheGamesDBAPIFormMapper.MapGameImageToFileToDownload(this.imageBaseUrls, bannerGameImage, 'banner');
      filesToDownload.push(fileToDownload);
    }
    this.downloadImagesService.DownloadImages(filesToDownload);
  }

  // Note: Angular will throw a TypeError in the template if these aren't cast as a FormGroup
  getGameSelectionFormGroup(): FormGroup { return this.formGroup.get(ApiInterfaceGroupName.GameSelection) as FormGroup; }
  getImageTypeSelectionFormGroup(): FormGroup { return this.formGroup.get(ApiInterfaceGroupName.ImageTypeSelection) as FormGroup; }
  
  private openAlertDialog(message: string) {
    this.dialog.open(AlertDialogComponent, {
      data: {message: message}
    });
  }
}
