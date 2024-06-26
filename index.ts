import FetchInstance from './helpers/FetchInstance';

import type { 
    PlexApiOptions, 
    PlexUser, 
    SwitchUserItem, 
    PlexResource, 
    PlexServerConnection, 
    PlexLibrary, 
    PlexTimelineArgs, 
    PlexProgress, 
    PlexArtistMetadata, 
    PlexArtistListMetadata, 
    PlexAlbumMetadata, 
    PlexTrackMedia, 
    PlexCollectionMetadata, 
    PlexTrack 
} from '@/plex.types'

//yarn add file:/home/adamskoog/plexapitest/dist
class PlexJavascriptApi {

    private static client: FetchInstance;

    private static PLEX_BASE_URL: string = 'https://plex.tv';
    private static PLEX_RESOURCES_URL: string = '/api/v2/resources';
    private static PLEX_USER_URL = '/api/v2/user';
    private static PLEX_USERS_URL = '/api/home/users';
    private static PLEX_PINS_URL = '/api/v2/pins';
    private static PLEX_USERS_V2_URL = '/api/v2/home/users';

    private static requestTokenParam: any = {
      'X-Plex-Token': null
    };

    private static requestBaseParams: any = {
        'X-Plex-Product': null,
        'X-Plex-Version': null,
        'X-Plex-Client-Identifier': null
    };

    static get baseParams() {
        return PlexJavascriptApi.requestBaseParams;
    }

    static get authToken() {
        return this.requestTokenParam['X-Plex-Token'];
    }

    static initialize = async (options: PlexApiOptions): Promise<void> => {
        this.requestBaseParams['X-Plex-Product'] = options.title;
        this.requestBaseParams['X-Plex-Client-Identifier'] = options.clientIdentifier;
        
        if (options.version) this.requestBaseParams['X-Plex-Version'] = options.version;
        if (options.device) this.requestBaseParams['X-Plex-Device'] = options.device;
        if (options.platform) this.requestBaseParams['X-Plex-Platform'] = options.platform;
        if (options.deviceName) this.requestBaseParams['X-Plex-Device-Name'] = options.deviceName;

        // Create a client for plex.tv requests
        this.client = new FetchInstance(this.PLEX_BASE_URL);
    }

    /**
     * Check the stored auth token to make sure it is still valid for use.
     * @returns {Promise<PlexUser>} - a promise for the plex.tv user information.
     */
    static validateToken = async (token: string): Promise<PlexUser> => {
      
        // We can't do anything without a token - error.
        if (!token) throw "No token provided, cannot initialize.";       
        this.requestTokenParam['X-Plex-Token'] = token;

        try {
          const response = await this.client.getJson(this.PLEX_USER_URL, {
              params: {
                ...this.requestBaseParams,
                ...this.requestTokenParam
              }
          });
          if (response.errors) {
            throw { message: response.errors[0].message };
          }
          // Return the user information
          return response as PlexUser;
        } catch {
          this.requestTokenParam['X-Plex-Token'] = null;
          throw { message: 'Unexpected error occurred.' };
        }
    };

    /**
     * Get the resources based on the authenticated user.
     * @param {string} id - the auth id obtained from plex.tv
     * @returns {Promise<string>} - the token associated to the current user.
     */
    static validatePin = async (id: string): Promise<string> => {

        const clientIdParams = { 'X-Plex-Client-Identifier': this.requestBaseParams['X-Plex-Client-Identifier'] };
        const url = FetchInstance.formatUrl(`/${this.PLEX_PINS_URL}/${id}`, clientIdParams)
        if (!this.client) this.client = new FetchInstance(this.PLEX_BASE_URL);
        const response = await this.client.getJson(url);
        return response.authToken as string;
    };

    /**
     * Do user sign in request
     * @returns {Promise<string>} - the specific oauth sign in id to authenticate with plex.tv.
     */
    static signIn = async (): Promise<{ url: string, authId: string }> => {
        const response = await this.client.postJson(this.PLEX_PINS_URL, {
            params: {
                strong: true,
                ...this.requestBaseParams
            }
        });

        const authAppUrl = FetchInstance.formatUrl(`https://app.plex.tv/auth#`, {
            clientID: this.requestBaseParams['X-Plex-Client-Identifier'],
            code: response.code,
            forwardUrl: window.location.href,
            context: {
                device: {
                    product: this.requestBaseParams['X-Plex-Product'],
                },
            },
        });

        return { url: authAppUrl, authId: response.id };
    };

    static getUsers = async (): Promise<SwitchUserItem[]> => {
      const response = await this.client.getXml(this.PLEX_USERS_URL, {
          params: {
              ...this.requestBaseParams,
              ...this.requestTokenParam
          }
      });

      const parser = new DOMParser();
      const doc1 = parser.parseFromString(response, "application/xml");
      const xmlUsers = doc1.children[0].children;
      let users = [] as SwitchUserItem[];

      for (let i = 0; i < xmlUsers.length; i++) {
          const item = xmlUsers.item(i);
          if (item != null) {

            const checkBoolean = (value: string | null) => {
                if (value && value === '1') return true;
                return false;
            }
            let tmp: SwitchUserItem = {
              id: parseInt(item.getAttribute('id') ?? ''),
              uuid: item.getAttribute('uuid') ?? '',
              admin: checkBoolean(item.getAttribute('admin')),
              restricted: checkBoolean(item.getAttribute('restricted')),
              protected: checkBoolean(item.getAttribute('protected')),
              title: item.getAttribute('title') ?? '',
              username: item.getAttribute('username') ?? '',
              email: item.getAttribute('email') ?? '',
              thumb: item.getAttribute('thumb') ?? '',
            }

            users.push(tmp);
          }
      }
      return users;
    }

    static switchUser = async (user: SwitchUserItem, pin?: string | undefined): Promise<PlexUser> => {

        const args = {
          pin,
            ...this.requestBaseParams,
            ...this.requestTokenParam
        }

        const url = FetchInstance.formatUrl(`${this.PLEX_USERS_V2_URL}/${user.uuid}/switch`, args)

        const response = await this.client.postJson(url)

        // Clear the current selected server from the class.
        this.selectServer(null);

        this.requestTokenParam['X-Plex-Token'] = response.authToken;

        return response as PlexUser;
    }

    /**
     * Get the resources based on the authenticated user.
     * @param {string} resourceType - a specific resource to be retrieved.
     * @returns {Promise<Array<PlexResource>>} - an array of the resources that match the request.
     */
    static getResources = async (resourceType?: string): Promise<Array<PlexResource>> => {
      const resources: Array<PlexResource> = await this.client.getJson(this.PLEX_RESOURCES_URL, {
            params: {
                includeHttps: 1,
                includeRelay: 1,
                ...this.requestBaseParams,
                ...this.requestTokenParam
            }
        })
        if (!resourceType) return resources; // return the unfilters resource reponse.   
        return resources.filter((resource: PlexResource) => resource.provides === resourceType);
    };

    /* Begin Server specific methods */
    /* ***************************** */

    private static serverClient: FetchInstance;

    private static baseUrl: string | null;
    private static serverRequestTokenParam: any = {
      'X-Plex-Token': null
    };

    private static makeServerRequest = async (url: string, args?: any): Promise<any> => {
        return await this.serverClient.getJson(url, {
            params: {
                ...this.baseParams,
                ...this.serverRequestTokenParam,
                ...args
            }
        });
    }

    /**
     * Run connection tests for a server to determine the best connection to use.
     * @param {PlexResource} resource - The plex resource instance that represents the active server.
     * @returns {Promise<ServerConnection>} - the preferred connection uri or error.
     */
    private static serverConnectionTest = (resource: PlexResource): Promise<PlexServerConnection> => new Promise((resolve, reject) => {
    
        // TODO: handle this better with base params.
        this.serverRequestTokenParam['X-Plex-Token'] = resource.accessToken;
    
        const params = { ...this.baseParams, ...this.serverRequestTokenParam };
        const connections = resource.connections;
        const connectionPromises = connections.map((connection: any) => {
    
            // Use different timeout lengths for local vs remote servers.
            // TODO: the local timeout was too short and failing after login.
            const timeout = 5000; ///(connection.local) ? 1000 : 5000;
    
            // Identity endpoint is very small, used by other projects.
            return FetchInstance.fetchWithTimeout(FetchInstance.formatUrl(`${connection.uri}/identity`, params), { timeout });
        });
    
        Promise.allSettled(connectionPromises).then((values: any) => {
            let preferredConnection: string | null = null;
            for (let i = 0; i < connections.length; i++) {
            for (let j = 0; j < values.length; j++) {
                if (values[i].status === 'fulfilled' && values[i].value.url.includes(connections[j].uri)) {
                preferredConnection = connections[j].uri;
                break;
                }
            }
            if (preferredConnection) break;
            }
    
            if (preferredConnection) resolve({ uri: preferredConnection });
            reject({ message: 'Failed to resolve connection to server.', error: 'No server connection found.' });
        }).catch((error) => {
            reject({ message: 'Failed to resolve connection to server.', error });
        });
    });

    static selectServer = async (resource: PlexResource | null): Promise<PlexServerConnection> => {
        if (!resource) {
            this.serverRequestTokenParam['X-Plex-Token'] = null;
            this.baseUrl = null;
            return { message: 'No resource selected - active server removed' };
        }

        // Set the access token for the server.
        this.serverRequestTokenParam['X-Plex-Token'] = resource.accessToken;

        // This class is initialized by a server being selected.
        // This can happen on load or from the Settings page.
        const connection = await this.serverConnectionTest(resource);
        
        if (connection.uri) {
          // set the internal base url of the class
          this.baseUrl = connection.uri ?? null;
          if (!this.baseUrl) throw 'TODO: Could not connect to server.'

          this.serverClient = new FetchInstance(this.baseUrl);
        }

        // Return the connection information - the url in the future
        // should not be needed in redux, but if an error has occurred 
        // we need to be able to handle it.
        return connection;
    };

    /**
     * Get a list of libraries for the currently selection server connection.
     * @returns {Promise<Array<PlexLibrary>>} - array of libraries that match audio type.
     */
    static getLibraries = async (libraryType?: string | undefined): Promise<Array<PlexLibrary>> => {
        const data = await this.serverClient.getJson('/library/sections', {
            params: {
                ...this.baseParams,
                ...this.serverRequestTokenParam
            }
        });
        const sections = data.MediaContainer.Directory;
      
        if (sections.length === 0) return [];
        if (!libraryType) return sections;
        return sections.filter((section: any) => section.type === libraryType);
    };

    /**
     * Get the url of an image from plex media server.
     * @param {number} h - the height in pixels of the requested image
     * @param {number} w - the width in pixels of the requested image
     * @param {string} thumb - the url of the requested image.
     * @param {boolean | undefined} minSize
     * @param {boolean | undefined} upscale
     * @param {number | undefined} blur
     * @param {number | undefined} opacity
     * @param {string | undefined} background
     * 
     * @returns {string} - the url of the transcoded image.
     */
    static getThumbnailTranscodeUrl = (
        h: number, 
        w: number, 
        thumb: string, 
        minSize?: boolean | undefined, 
        upscale?: boolean | undefined
      ): string => {

      // We need to add the token to the thumb query we get
      let url = `${thumb}?X-Plex-Token=${this.serverRequestTokenParam['X-Plex-Token']}`;
      if (thumb.includes('?')) url = `${thumb}&X-Plex-Token=${this.serverRequestTokenParam['X-Plex-Token']}`;

      const params = {
        width: w,
        height: h,
        minSize: minSize ? 1 : 0,
        upscale: upscale ? 1 : 0,
        url,
        ...this.serverRequestTokenParam
      };
      return FetchInstance.formatUrl(`${this.baseUrl}/photo/:/transcode`, params);
    };

    // static getThumbnailTranscodeUrl = ({ width, height, thumb, minSize, upscale, blur, opacity, background }: TranscodeImageProps): string => {

    //   const params = {
    //     width,
    //     height,
    //     minSize: minSize ? 1 : 0,
    //     upscale: upscale ? 1 : 0,
    //     blur,
    //     opacity,
    //     background,
    //     url: `${thumb}?X-Plex-Token=${this.requestTokenParam['X-Plex-Token']}`,
    //     // ...this.serverRequestTokenParam
    //   };
    //   return FetchInstance.formatUrl(`${this.baseUrl}/photo/:/transcode`, params);
    // };

    /**
     * Mark the track referenced by the key as watched/listened.
     * @param {string} key - the key of the requested track.
     */
    static scrobble = async (key: string): Promise<void> => {

      await this.serverClient.getJson(`/:/scrobble`, {
          params: {
              key, // ratingKey
              identifier: 'com.plexapp.plugins.library',
              ...this.baseParams,
              ...this.serverRequestTokenParam
          }
      });
   
      // we don't need to do anything, need to handle error.
    };
    
    /**
     * Mark the track referenced by the key as watched/listened.
     * @param {string} key - the key of the requested track.
     */
    static unscrobble = async (key: string): Promise<void> => {

      await this.serverClient.getJson(`/:/unscrobble`, {
          params: {
              key, // ratingKey
              identifier: 'com.plexapp.plugins.library',
              ...this.baseParams,
              ...this.serverRequestTokenParam
          }
      });
       
      // we don't need to do anything, need to handle error.
    };

    /**
     * Update the play progress of the current track on the server
     * @param {PlexTimelineArgs} args - the arguments needed to update the timeline.
     * @returns {Promise<PlexProgress>} - 
     */
    static updateTimeline = async ({ ratingKey, key, state, time, playbackTime, duration }: PlexTimelineArgs): Promise<PlexProgress> => {
        const response = await this.serverClient.getJson(`/:/timeline`, {
            params: {
                identifier: 'com.plexapp.plugins.library',
                ...this.baseParams,
                ...this.serverRequestTokenParam,
                ratingKey,
                key,
                state,
                time,
                playbackTime,
                duration,
                hasMDE: 0,
                'X-Plex-Text-Format': 'plain'
            }
        });
        return response.MediaContainer;
    };

    /**
     * Determine the correct media to play from the server.
     * TODO: this doesn't do much, just grabs the first item.
     * @param {PlexTrackMedia} track - The track object to determine media.
     * @returns {string} - 
     */
    static getTrackMediaUrl = (track: PlexTrackMedia): string | null => {
        // Probably need to handle multiparts in some way? Even if it's just a warning?
        if (!track.Part[0]) return null;
        return FetchInstance.formatUrl(`${this.baseUrl}${track.Part[0].key}`, this.serverRequestTokenParam);
    };
 
    /**
     * Get the metadata of the requested Album.
     * @param {string} ratingKey - The key of the requested item
     * @returns {Promise<PlexAlbumMetadata>} - 
     */
    static getAlbumMetadata = async (ratingKey: string): Promise<PlexAlbumMetadata> => {

      // Merging the album information with the tracks so we have a consistent format.
      // It seems the plex web app makes two seperate requests to get this information
      // as well.
      const response = await this.makeServerRequest(`/library/metadata/${ratingKey}`);

      return response.MediaContainer.Metadata[0];
    };

    /**
     * Get the tracks of the requested Album.
     * @param {string} ratingKey - The key of the requested item
     * @returns {Promise<PlexTrack[]>} - 
     */
    static getAlbumTracks = async (ratingKey: string): Promise<PlexTrack[]> => {
        const response = await this.makeServerRequest(`/library/metadata/${ratingKey}/children`);
        return response.MediaContainer.Metadata as PlexTrack[];
    }

    /**
     * Get the metadata of the requested Artist.
     * @param {string} ratingKey - The key of the requested item
     * @returns {Promise<PlexArtistMetadata>} - 
     */
    static getArtistMetadata = async (ratingKey: string): Promise<PlexArtistMetadata> => {
        const response = await this.makeServerRequest(`/library/metadata/${ratingKey}/children`);
        return response.MediaContainer;
    };

    /**
     * Get the metadata of the requested Collection.
     * @param {string} ratingKey - The key of the requested item
     * @returns {Promise<PlexCollectionMetadata>} - 
     */
    static getCollectionMetadata = async (ratingKey: string): Promise<PlexCollectionMetadata> => {
      const response = await this.makeServerRequest(`/library/collections/${ratingKey}`);
      return response.MediaContainer.Metadata[0];
    }

    /**
     * Get the items of the requested Collection.
     * @param {string} ratingKey - The key of the requested item
     * @returns {Promise<PlexAlbumMetadata>} - 
     */
    static getCollectionItems = async (ratingKey: string): Promise<PlexAlbumMetadata[]> => {
      const response = await this.makeServerRequest(`/library/collections/${ratingKey}/children`);
      return response.MediaContainer.Metadata as PlexAlbumMetadata[];
    }

    // TODO: the following 2 functions can be merged.
    /**
     * Get the recently added and listened hub items.
     * The return type for this is a bit odd - the queries are actually against
     * the artists, so we get the artist metadata type back.
     * @param {string} section - The library section.
     * @param {Promise<Array<PlexAlbumMetadata>>} args - The albums matching the query.
     * @returns {Promise<Array<PlexAlbumMetadata>>} - 
     */
    static getLibraryHubItems = async (section: string, type: number, args: any): Promise<Array<PlexAlbumMetadata>> => {

        if (section == '') return [];
        if (isNaN(type)) return [];
        
        const localParams = {
          type,
          includeAdvanced: 1,
          includeMeta: 1,
          includeCollections: 1,
          includeExternalMedia: 1
        };

        const response = await this.serverClient.getJson(`/library/sections/${section}/all`, {
            params: {
                ...this.baseParams,
                ...localParams,
                ...args,
                ...this.serverRequestTokenParam
            }
        });
        const data = response?.MediaContainer as PlexArtistMetadata;
        if (!data) return [];
        return data.Metadata;
    };

    /**
     * The the media items to display in the library.
     * @param {string | null} section - The library section.
     * @param {any} sortArgs - The information for sorting.
     * @return {Promise<Array<PlexAlbumMetadata | PlexArtistListMetadata>>}
     */
    static getLibraryItems = async (section: string | null, sortArgs: any): Promise<Array<PlexAlbumMetadata | PlexArtistListMetadata | PlexCollectionMetadata>> => {
        if (!section) return [];
      
        const localParams = {
          type: sortArgs.type,
          includeAdvanced: 1,
          includeMeta: 1,
          includeCollections: 1,
          includeExternalMedia: 1,
          sort: sortArgs.order,
        };
  
        const response = await this.serverClient.getJson(`/library/sections/${section}/all`, {
            params: {
                ...this.baseParams,
                ...localParams,
                ...this.serverRequestTokenParam
            }
        });
  
        return response.MediaContainer.Metadata ?? [];
    };
}

export default PlexJavascriptApi

// type TranscodeImageProps = {
//   height: number, 
//   width: number, 
//   thumb: string, 
//   minSize?: boolean | undefined, 
//   upscale?: boolean | undefined,
//   blur?: number | undefined,
//   opacity?: number | undefined,
//   background?: string | undefined
// }