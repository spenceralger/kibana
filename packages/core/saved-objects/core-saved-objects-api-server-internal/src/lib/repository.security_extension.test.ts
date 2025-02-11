/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0 and the Server Side Public License, v 1; you may not use this file except
 * in compliance with, at your election, the Elastic License 2.0 or the Server
 * Side Public License, v 1.
 */

import {
  pointInTimeFinderMock,
  mockGetCurrentTime,
  mockGetSearchDsl,
  mockDeleteLegacyUrlAliases,
  mockPreflightCheckForCreate,
} from './repository.test.mock';

import { SavedObjectsRepository } from './repository';
import { loggerMock } from '@kbn/logging-mocks';
import { estypes } from '@elastic/elasticsearch';
import { elasticsearchClientMock } from '@kbn/core-elasticsearch-client-server-mocks';
import { SavedObjectsBulkUpdateObject } from '@kbn/core-saved-objects-api-server';
import { SavedObjectsSerializer } from '@kbn/core-saved-objects-base-server-internal';
import { SavedObject } from '@kbn/core-saved-objects-common';
import {
  ISavedObjectsSecurityExtension,
  AuditAction,
  SavedObjectsRawDocSource,
  AuthorizationTypeEntry,
} from '@kbn/core-saved-objects-server';
import { kibanaMigratorMock } from '../mocks';
import {
  createRegistry,
  createDocumentMigrator,
  mappings,
  createSpySerializer,
  mockTimestamp,
  checkAuthError,
  getSuccess,
  setupCheckUnauthorized,
  setupEnforceFailure,
  enforceError,
  setupCheckAuthorized,
  setupRedactPassthrough,
  MULTI_NAMESPACE_CUSTOM_INDEX_TYPE,
  setsAreEqual,
  typeMapsAreEqual,
  authMap,
  setupEnforceSuccess,
  updateSuccess,
  deleteSuccess,
  removeReferencesToSuccess,
  REMOVE_REFS_COUNT,
  checkConflictsSuccess,
  findSuccess,
  mockTimestampFields,
  mockVersion,
  NAMESPACE_AGNOSTIC_TYPE,
  setupCheckPartiallyAuthorized,
  bulkGetSuccess,
  expectBulkGetResult,
  bulkCreateSuccess,
  expectCreateResult,
  MULTI_NAMESPACE_TYPE,
  bulkUpdateSuccess,
  expectUpdateResult,
  bulkDeleteSuccess,
  createBulkDeleteSuccessStatus,
  namespaceMapsAreEqual,
} from '../test_helpers/repository.test.common';
import { savedObjectsExtensionsMock } from '../mocks/saved_objects_extensions.mock';

// BEWARE: The SavedObjectClient depends on the implementation details of the SavedObjectsRepository
// so any breaking changes to this repository are considered breaking changes to the SavedObjectsClient.

describe('SavedObjectsRepository Security Extension', () => {
  let client: ReturnType<typeof elasticsearchClientMock.createElasticsearchClient>;
  let repository: SavedObjectsRepository;
  let migrator: ReturnType<typeof kibanaMigratorMock.create>;
  let logger: ReturnType<typeof loggerMock.create>;
  let serializer: jest.Mocked<SavedObjectsSerializer>;
  let mockSecurityExt: jest.Mocked<ISavedObjectsSecurityExtension>;

  const registry = createRegistry();
  const documentMigrator = createDocumentMigrator(registry);

  const instantiateRepository = () => {
    const allTypes = registry.getAllTypes().map((type) => type.name);
    const allowedTypes = [...new Set(allTypes.filter((type) => !registry.isHidden(type)))];

    // @ts-expect-error must use the private constructor to use the mocked serializer
    return new SavedObjectsRepository({
      index: '.kibana-test',
      mappings,
      client,
      migrator,
      typeRegistry: registry,
      serializer,
      allowedTypes,
      logger,
      extensions: { securityExtension: mockSecurityExt },
    });
  };

  const type = 'index-pattern';
  const id = 'logstash-*';
  const namespace = 'foo-namespace';
  const attributes = { attr1: 'one', attr2: 'two', attr3: 'three' };
  const multiNamespaceObjNamespaces = ['ns-1', 'ns-2', namespace];

  beforeEach(() => {
    pointInTimeFinderMock.mockClear();
    client = elasticsearchClientMock.createElasticsearchClient();
    migrator = kibanaMigratorMock.create();
    documentMigrator.prepareMigrations();
    migrator.migrateDocument = jest.fn().mockImplementation(documentMigrator.migrate);
    migrator.runMigrations = jest.fn().mockResolvedValue([{ status: 'skipped' }]);
    logger = loggerMock.create();

    // create a mock serializer "shim" so we can track function calls, but use the real serializer's implementation
    serializer = createSpySerializer(registry);

    // create a mock saved objects encryption extension
    mockSecurityExt = savedObjectsExtensionsMock.createSecurityExtension();

    mockGetCurrentTime.mockReturnValue(mockTimestamp);
    mockGetSearchDsl.mockClear();

    repository = instantiateRepository();
  });

  afterEach(() => {
    mockSecurityExt.checkAuthorization.mockClear();
    mockSecurityExt.redactNamespaces.mockClear();
  });

  describe('#get', () => {
    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(
        getSuccess(client, repository, registry, type, id, { namespace })
      ).rejects.toThrow(checkAuthError);
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`propagates decorated error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        getSuccess(client, repository, registry, type, id, { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
    });

    test(`returns result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const result = await getSuccess(client, repository, registry, type, id, { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(client.get).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expect.objectContaining({ type, id, namespaces: [namespace] }));
    });

    test(`calls checkAuthorization with type, actions, and namespaces`, async () => {
      await getSuccess(
        client,
        repository,
        registry,
        MULTI_NAMESPACE_CUSTOM_INDEX_TYPE,
        id,
        {
          namespace,
        },
        undefined,
        multiNamespaceObjNamespaces // all of the object's namespaces from preflight check are added to the auth check call
      );

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['get']);
      const expectedSpaces = new Set(multiNamespaceObjNamespaces);
      const expectedTypes = new Set([MULTI_NAMESPACE_CUSTOM_INDEX_TYPE]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls enforceAuthorization with action, type map, and auth map`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      await getSuccess(client, repository, registry, type, id, { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'get',
        })
      );

      const expectedTypesAndSpaces = new Map([[type, new Set([namespace])]]);

      const { typesAndSpaces: actualTypesAndSpaces, typeMap: actualTypeMap } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
      expect(actualTypeMap).toBe(authMap);
    });

    test(`calls redactNamespaces with authorization map`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      await getSuccess(client, repository, registry, type, id, { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);

      expect(mockSecurityExt.redactNamespaces).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.redactNamespaces).toHaveBeenCalledWith(
        expect.objectContaining({
          typeMap: authMap,
          savedObject: expect.objectContaining({ type, id, namespaces: [namespace] }),
        })
      );
    });

    test(`adds audit event when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);
      setupEnforceSuccess(mockSecurityExt);

      await getSuccess(client, repository, registry, type, id, { namespace });

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.GET,
        savedObject: { type, id },
      });
    });

    test(`adds audit event when not successful`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        getSuccess(client, repository, registry, type, id, { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.GET,
        savedObject: { type, id },
        error: enforceError,
      });
    });
  });

  describe('#update', () => {
    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(
        updateSuccess(client, repository, registry, type, id, attributes, { namespace })
      ).rejects.toThrow(checkAuthError);
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`propagates decorated error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        updateSuccess(client, repository, registry, type, id, attributes, { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
    });

    test(`returns result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const result = await updateSuccess(client, repository, registry, type, id, attributes, {
        namespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(client.update).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({ id, type, attributes, namespaces: [namespace] })
      );
    });

    test(`calls checkAuthorization with type, actions, and namespaces`, async () => {
      await updateSuccess(
        client,
        repository,
        registry,
        MULTI_NAMESPACE_CUSTOM_INDEX_TYPE,
        id,
        attributes,
        {
          namespace,
        },
        {},
        multiNamespaceObjNamespaces // all of the object's namespaces from preflight check are added to the auth check call
      );

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);

      const expectedActions = new Set(['update']);
      const expectedSpaces = new Set(multiNamespaceObjNamespaces);
      const expectedTypes = new Set([MULTI_NAMESPACE_CUSTOM_INDEX_TYPE]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls enforceAuthorization with action, type map, and auth map`, async () => {
      mockSecurityExt.checkAuthorization.mockResolvedValue({
        status: 'fully_authorized',
        typeMap: authMap,
      });

      await updateSuccess(
        client,
        repository,
        registry,
        type,
        id,
        attributes,
        { namespace },
        undefined,
        multiNamespaceObjNamespaces
      );

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'update',
        })
      );

      const expectedTypesAndSpaces = new Map([[type, new Set([namespace])]]);

      const { typesAndSpaces: actualTypesAndSpaces, typeMap: actualTypeMap } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
      expect(actualTypeMap).toBe(authMap);
    });

    test(`calls redactNamespaces with authorization map`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      await updateSuccess(client, repository, registry, type, id, attributes, { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);

      expect(mockSecurityExt.redactNamespaces).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.redactNamespaces).toHaveBeenCalledWith(
        expect.objectContaining({
          typeMap: authMap,
          savedObject: expect.objectContaining({ type, id, namespaces: [namespace] }),
        })
      );
    });

    test(`adds audit event when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);
      setupEnforceSuccess(mockSecurityExt);

      await updateSuccess(client, repository, registry, type, id, attributes, { namespace });

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.UPDATE,
        savedObject: { type, id },
        error: undefined,
        outcome: 'unknown',
      });
    });
    test(`adds audit event when not successful`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        updateSuccess(client, repository, registry, type, id, { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.UPDATE,
        savedObject: { type, id },
        error: enforceError,
      });
    });
  });

  describe('#create', () => {
    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(repository.create(type, attributes, { namespace })).rejects.toThrow(
        checkAuthError
      );
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`propagates decorated error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(repository.create(type, attributes, { namespace })).rejects.toThrow(
        enforceError
      );

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
    });

    test(`returns result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const result = await repository.create(type, attributes, {
        namespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(client.create).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          id: expect.objectContaining(/index-pattern:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/),
          type,
          attributes,
          namespaces: [namespace],
        })
      );
    });

    test(`calls checkAuthorization with type, actions, and namespace`, async () => {
      await repository.create(MULTI_NAMESPACE_CUSTOM_INDEX_TYPE, attributes, {
        namespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['create']);
      const expectedSpaces = new Set([namespace]);
      const expectedTypes = new Set([MULTI_NAMESPACE_CUSTOM_INDEX_TYPE]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls checkAuthorization with type, actions, namespace, and initial namespaces`, async () => {
      await repository.create(MULTI_NAMESPACE_CUSTOM_INDEX_TYPE, attributes, {
        namespace,
        initialNamespaces: multiNamespaceObjNamespaces,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['create']);
      const expectedSpaces = new Set(multiNamespaceObjNamespaces);
      const expectedTypes = new Set([MULTI_NAMESPACE_CUSTOM_INDEX_TYPE]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls enforceAuthorization with action, type map, and auth map`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      await repository.create(MULTI_NAMESPACE_CUSTOM_INDEX_TYPE, attributes, {
        namespace,
        initialNamespaces: multiNamespaceObjNamespaces,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'create',
        })
      );

      const expectedTypesAndSpaces = new Map([
        [MULTI_NAMESPACE_CUSTOM_INDEX_TYPE, new Set(multiNamespaceObjNamespaces)],
      ]);

      const { typesAndSpaces: actualTypesAndSpaces, typeMap: actualTypeMap } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
      expect(actualTypeMap).toBe(authMap);
    });

    test(`calls redactNamespaces with authorization map`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      await repository.create(type, attributes, { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);

      expect(mockSecurityExt.redactNamespaces).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.redactNamespaces).toHaveBeenCalledWith(
        expect.objectContaining({
          typeMap: authMap,
          savedObject: expect.objectContaining({
            type,
            id: expect.objectContaining(/index-pattern:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/),
            namespaces: [namespace],
          }),
        })
      );
    });

    test(`adds audit event when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupEnforceSuccess(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      await repository.create(type, attributes, { namespace });

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.CREATE,
        savedObject: {
          type,
          id: expect.objectContaining(/index-pattern:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/),
        },
        error: undefined,
        outcome: 'unknown',
      });
    });

    test(`adds audit event when not successful`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(repository.create(type, attributes, { namespace })).rejects.toThrow(
        enforceError
      );

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.CREATE,
        savedObject: {
          type,
          id: expect.objectContaining(/index-pattern:[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}/),
        },
        error: enforceError,
      });
    });
  });

  describe('#delete', () => {
    beforeAll(() => {
      mockDeleteLegacyUrlAliases.mockResolvedValue();
    });

    afterAll(() => {
      mockDeleteLegacyUrlAliases.mockClear();
    });

    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(
        deleteSuccess(client, repository, registry, type, id, { namespace })
      ).rejects.toThrow(checkAuthError);
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`propagates decorated error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        deleteSuccess(client, repository, registry, type, id, { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
    });

    test(`returns empty object result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const result = await deleteSuccess(client, repository, registry, type, id, {
        namespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(client.delete).toHaveBeenCalledTimes(1);
      expect(result).toEqual({});
    });

    test(`calls checkAuthorization with type, actions, and namespaces`, async () => {
      await deleteSuccess(client, repository, registry, MULTI_NAMESPACE_CUSTOM_INDEX_TYPE, id, {
        namespace,
        force: true,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['delete']);
      const expectedSpaces = new Set([namespace]);
      const expectedTypes = new Set([MULTI_NAMESPACE_CUSTOM_INDEX_TYPE]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls enforceAuthorization with action, type map, and auth map`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      await deleteSuccess(client, repository, registry, MULTI_NAMESPACE_CUSTOM_INDEX_TYPE, id, {
        namespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
        })
      );
      const expectedTypesAndSpaces = new Map([
        [MULTI_NAMESPACE_CUSTOM_INDEX_TYPE, new Set([namespace])],
      ]);

      const { typesAndSpaces: actualTypesAndSpaces, typeMap: actualTypeMap } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
      expect(actualTypeMap).toBe(authMap);
    });

    test(`adds audit event when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);
      setupEnforceSuccess(mockSecurityExt);

      await deleteSuccess(client, repository, registry, type, id, { namespace });

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.DELETE,
        savedObject: { type, id },
        error: undefined,
        outcome: 'unknown',
      });
    });

    test(`adds audit event when not successful`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        deleteSuccess(client, repository, registry, type, id, { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.DELETE,
        savedObject: { type, id },
        error: enforceError,
      });
    });
  });

  describe('#removeReferencesTo', () => {
    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(
        removeReferencesToSuccess(client, repository, type, id, { namespace })
      ).rejects.toThrow(checkAuthError);
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`propagates decorated error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        removeReferencesToSuccess(client, repository, type, id, { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
    });

    test(`returns result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const result = await removeReferencesToSuccess(client, repository, type, id, { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(client.updateByQuery).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expect.objectContaining({ updated: REMOVE_REFS_COUNT }));
    });

    test(`calls checkAuthorization with type, actions, and namespaces`, async () => {
      await removeReferencesToSuccess(client, repository, type, id, { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['delete']);
      const expectedSpaces = new Set([namespace]);
      const expectedTypes = new Set([type]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls enforceAuthorization with type/namespace map`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      await removeReferencesToSuccess(client, repository, type, id, { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'delete',
        })
      );

      const expectedTypesAndSpaces = new Map([[type, new Set([namespace])]]);

      const { typesAndSpaces: actualTypesAndSpaces, typeMap: actualTypeMap } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
      expect(actualTypeMap).toBe(authMap);
    });

    test(`adds audit event when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);
      setupEnforceSuccess(mockSecurityExt);

      await removeReferencesToSuccess(client, repository, type, id, { namespace });

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.REMOVE_REFERENCES,
        savedObject: { type, id },
        error: undefined,
        outcome: 'unknown',
      });
    });

    test(`adds audit event when not successful`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        removeReferencesToSuccess(client, repository, type, id, { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.REMOVE_REFERENCES,
        savedObject: { type, id },
        error: enforceError,
      });
    });
  });

  describe('#checkConflicts', () => {
    const obj1 = { type, id: 'one' };
    const obj2 = { type, id: 'two' };

    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(
        checkConflictsSuccess(client, repository, registry, [obj1, obj2], { namespace })
      ).rejects.toThrow(checkAuthError);
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`propagates decorated error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        checkConflictsSuccess(client, repository, registry, [obj1, obj2], { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
    });

    test(`returns result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const result = await checkConflictsSuccess(client, repository, registry, [obj1, obj2], {
        namespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(client.mget).toHaveBeenCalledTimes(1);
      // Default mock mget makes each object found
      expect(result).toEqual(
        expect.objectContaining({
          errors: [
            {
              error: {
                error: 'Conflict',
                message: `Saved object [${obj1.type}/${obj1.id}] conflict`,
                statusCode: 409,
              },
              id: obj1.id,
              type: obj1.type,
            },
            {
              error: {
                error: 'Conflict',
                message: `Saved object [${obj2.type}/${obj2.id}] conflict`,
                statusCode: 409,
              },
              id: obj2.id,
              type: obj2.type,
            },
          ],
        })
      );
    });

    test(`calls checkAuthorization with type, actions, and namespaces`, async () => {
      await checkConflictsSuccess(client, repository, registry, [obj1, obj2], { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['bulk_create']);
      const expectedSpaces = new Set([namespace]);
      const expectedTypes = new Set([type]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls enforceAuthorization with type/namespace map`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      await checkConflictsSuccess(client, repository, registry, [obj1, obj2], { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'bulk_create',
        })
      );
      const expectedTypesAndSpaces = new Map([[type, new Set([namespace])]]);

      const { typesAndSpaces: actualTypesAndSpaces, typeMap: actualTypeMap } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
      expect(actualTypeMap).toBe(authMap);
    });
  });

  describe('#openPointInTimeForType', () => {
    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(repository.openPointInTimeForType(type)).rejects.toThrow(checkAuthError);
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`returns result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      client.openPointInTime.mockResponseOnce({ id });
      const result = await repository.openPointInTimeForType(type);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
      expect(client.openPointInTime).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expect.objectContaining({ id }));
    });

    test(`adds audit event when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      client.openPointInTime.mockResponseOnce({ id });
      await repository.openPointInTimeForType(type);

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.OPEN_POINT_IN_TIME,
        outcome: 'unknown',
      });
    });

    test(`throws an error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      await expect(repository.openPointInTimeForType(type)).rejects.toThrowError();
    });

    test(`adds audit event when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);

      await expect(repository.openPointInTimeForType(type)).rejects.toThrowError();

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.OPEN_POINT_IN_TIME,
        error: new Error('User is unauthorized for any requested types/spaces.'),
      });
    });

    test(`calls checkAuthorization with type, actions, and namespaces`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      client.openPointInTime.mockResponseOnce({ id });
      await repository.openPointInTimeForType(type, { namespaces: [namespace] });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['open_point_in_time']);
      const expectedSpaces = new Set([namespace]);
      const expectedTypes = new Set([type]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });
  });

  describe('#closePointInTime', () => {
    test(`returns result of es client`, async () => {
      const expectedResult = { succeeded: true, num_freed: 3 };
      client.closePointInTime.mockResponseOnce(expectedResult);
      const result = await repository.closePointInTime(id);
      expect(client.closePointInTime).toHaveBeenCalledTimes(1);
      expect(result).toEqual(expectedResult);
    });

    test(`adds audit event`, async () => {
      await repository.closePointInTime(id);

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.CLOSE_POINT_IN_TIME,
        outcome: 'unknown',
      });
    });
  });

  describe('#find', () => {
    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(findSuccess(client, repository, { type })).rejects.toThrow(checkAuthError);
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`returns empty result when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);

      const result = await repository.find({ type });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(result).toEqual(
        expect.objectContaining({
          saved_objects: [],
          total: 0,
        })
      );
    });

    test(`calls es search with only authorized spaces when partially authorized`, async () => {
      // Setup partial authorization with the specific type and space of the current test definition
      const authRecord: Record<string, AuthorizationTypeEntry> = {
        find: { authorizedSpaces: [namespace] },
      };
      mockSecurityExt.checkAuthorization.mockResolvedValue({
        status: 'partially_authorized',
        typeMap: Object.freeze(new Map([[type, authRecord]])),
      });

      await findSuccess(client, repository, { type, namespaces: [namespace, 'ns-1'] });
      expect(mockGetSearchDsl.mock.calls[0].length).toBe(3); // Find success verifies this is called once, this shouyld always pass
      const {
        typeToNamespacesMap: actualMap,
      }: { typeToNamespacesMap: Map<string, string[] | undefined> } =
        mockGetSearchDsl.mock.calls[0][2];

      expect(actualMap).toBeDefined();
      const expectedMap = new Map<string, string[] | undefined>();
      expectedMap.set(type, [namespace]);
      expect(namespaceMapsAreEqual(actualMap, expectedMap)).toBeTruthy();
    });

    test(`returns result of es find when fully authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const { result, generatedResults } = await findSuccess(
        client,
        repository,
        { type },
        namespace
      );
      const count = generatedResults.hits.hits.length;

      expect(result.total).toBe(count);
      expect(result.saved_objects).toHaveLength(count);

      generatedResults.hits.hits.forEach((doc, i) => {
        expect(result.saved_objects[i]).toEqual({
          id: doc._id.replace(/(foo-namespace\:)?(index-pattern|config|globalType)\:/, ''),
          type: doc._source!.type,
          originId: doc._source!.originId,
          ...mockTimestampFields,
          version: mockVersion,
          score: doc._score,
          attributes: doc._source![doc._source!.type],
          references: [],
          namespaces: doc._source!.type === NAMESPACE_AGNOSTIC_TYPE ? undefined : [namespace],
        });
      });
    });

    test(`uses the authorization map when partially authorized`, async () => {
      setupCheckPartiallyAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      await findSuccess(
        client,
        repository,
        { type: [type, NAMESPACE_AGNOSTIC_TYPE], namespaces: [namespace, 'ns-1'] }, // include multiple types and spaces
        namespace
      );

      // make sure the authorized map gets passed to the es client call
      expect(mockGetSearchDsl).toHaveBeenCalledWith(
        expect.objectContaining({}),
        expect.objectContaining({}),
        expect.objectContaining({
          typeToNamespacesMap: authMap,
        })
      );
    });

    test(`returns result of es find when partially authorized`, async () => {
      setupCheckPartiallyAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const { result, generatedResults } = await findSuccess(
        client,
        repository,
        { type },
        namespace
      );
      const count = generatedResults.hits.hits.length;

      expect(result.total).toBe(count);
      expect(result.saved_objects).toHaveLength(count);

      generatedResults.hits.hits.forEach((doc, i) => {
        expect(result.saved_objects[i]).toEqual({
          id: doc._id.replace(/(foo-namespace\:)?(index-pattern|config|globalType)\:/, ''),
          type: doc._source!.type,
          originId: doc._source!.originId,
          ...mockTimestampFields,
          version: mockVersion,
          score: doc._score,
          attributes: doc._source![doc._source!.type],
          references: [],
          namespaces: doc._source!.type === NAMESPACE_AGNOSTIC_TYPE ? undefined : [namespace],
        });
      });
    });

    test(`calls checkAuthorization with type, actions, and namespaces`, async () => {
      setupCheckPartiallyAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);
      await findSuccess(client, repository, { type, namespaces: [namespace] });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(2);
      const expectedActions = new Set(['find']);
      const expectedSpaces = new Set([namespace]);
      const expectedTypes = new Set([type]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls redactNamespaces with authorization map`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const { generatedResults } = await findSuccess(client, repository, {
        type,
        namespaces: [namespace],
      });

      expect(mockSecurityExt.redactNamespaces).toHaveBeenCalledTimes(
        generatedResults.hits.hits.length
      );
      expect(mockSecurityExt.redactNamespaces).toBeCalledWith(
        expect.objectContaining({
          typeMap: authMap,
        })
      );
    });

    test(`adds audit per object event when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const { generatedResults } = await findSuccess(client, repository, {
        type,
        namespaces: [namespace],
      });

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(
        generatedResults.hits.hits.length
      );

      generatedResults.hits.hits.forEach((doc, i) => {
        expect(mockSecurityExt.addAuditEvent.mock.calls[i]).toEqual([
          {
            action: AuditAction.FIND,
            savedObject: {
              type: doc._source!.type,
              id: doc._id.replace(/(foo-namespace\:)?(index-pattern|config|globalType)\:/, ''),
            },
          },
        ]);
      });
    });

    test(`adds audit event when not successful`, async () => {
      setupCheckUnauthorized(mockSecurityExt);

      await repository.find({ type });

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
        action: AuditAction.FIND,
        error: new Error('User is unauthorized for any requested types/spaces.'),
      });
    });
  });

  describe('#bulkGet', () => {
    const obj1: SavedObject<unknown> = {
      type: 'config',
      id: '6.0.0-alpha1',
      attributes: { title: 'Testing' },
      references: [
        {
          name: 'ref_0',
          type: 'test',
          id: '1',
        },
      ],
      namespaces: [namespace],
      originId: 'some-origin-id', // only one of the results has an originId, this is intentional to test both a positive and negative case
    };
    const obj2: SavedObject<unknown> = {
      type: 'index-pattern',
      id: 'logstash-*',
      attributes: { title: 'Testing' },
      references: [
        {
          name: 'ref_0',
          type: 'test',
          id: '2',
        },
      ],
      namespaces: [namespace],
    };

    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(
        bulkGetSuccess(client, repository, registry, [obj1, obj2], { namespace })
      ).rejects.toThrow(checkAuthError);
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`propagates decorated error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        bulkGetSuccess(client, repository, registry, [obj1, obj2], { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'bulk_get',
        })
      );

      const expectedTypesAndSpaces = new Map([
        [obj1.type, new Set([namespace])],
        [obj2.type, new Set([namespace])],
      ]);

      const { typesAndSpaces: actualTypesAndSpaces } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
    });

    test(`returns result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const { result, mockResponse } = await bulkGetSuccess(
        client,
        repository,
        registry,
        [obj1, obj2],
        { namespace }
      );

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(client.mget).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        saved_objects: [
          expectBulkGetResult(
            obj1,
            mockResponse.docs[0] as estypes.GetGetResult<SavedObjectsRawDocSource>
          ),
          expectBulkGetResult(
            obj2,
            mockResponse.docs[1] as estypes.GetGetResult<SavedObjectsRawDocSource>
          ),
        ],
      });
    });

    test(`calls checkAuthorization with type, actions, namespace, and object namespaces`, async () => {
      const objA = {
        ...obj1,
        type: MULTI_NAMESPACE_CUSTOM_INDEX_TYPE, // replace the type to a mult-namespace type for this test to be thorough
        namespaces: multiNamespaceObjNamespaces, // include multiple spaces
      };
      const objB = { ...obj2, namespaces: ['ns-3'] }; // use a different namespace than the options namespace;
      const optionsNamespace = 'ns-4';

      await bulkGetSuccess(client, repository, registry, [objA, objB], {
        namespace: optionsNamespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['bulk_get']);
      const expectedSpaces = new Set([optionsNamespace, ...objA.namespaces, ...objB.namespaces]);
      const expectedTypes = new Set([objA.type, objB.type]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls enforceAuthorization with action, type map, and auth map`, async () => {
      const objA = {
        ...obj1,
        type: MULTI_NAMESPACE_CUSTOM_INDEX_TYPE, // replace the type to a mult-namespace type for this test to be thorough
        namespaces: multiNamespaceObjNamespaces, // include multiple spaces
      };
      const objB = { ...obj2, namespaces: ['ns-3'] }; // use a different namespace than the options namespace;
      const optionsNamespace = 'ns-4';

      setupCheckAuthorized(mockSecurityExt);

      await bulkGetSuccess(client, repository, registry, [objA, objB], {
        namespace: optionsNamespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'bulk_get',
        })
      );

      const expectedTypesAndSpaces = new Map([
        [objA.type, new Set([optionsNamespace, ...objA.namespaces])],
        [objB.type, new Set([optionsNamespace, ...objB.namespaces])],
      ]);

      const { typesAndSpaces: actualTypesAndSpaces, typeMap: actualTypeMap } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
      expect(actualTypeMap).toBe(authMap); // ToDo? reference comparison ok, object is frozen
    });

    test(`calls redactNamespaces with authorization map`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const objects = [obj1, obj2];

      await bulkGetSuccess(client, repository, registry, objects, { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);

      expect(mockSecurityExt.redactNamespaces).toHaveBeenCalledTimes(2);

      objects.forEach((obj, i) => {
        const { savedObject, typeMap } = mockSecurityExt.redactNamespaces.mock.calls[i][0];
        expect(savedObject).toEqual(
          expect.objectContaining({
            type: obj.type,
            id: obj.id,
            namespaces: [namespace],
          })
        );
        expect(typeMap).toBe(authMap);
      });
    });

    test(`adds audit event per object when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);
      setupEnforceSuccess(mockSecurityExt);

      const objects = [obj1, obj2];
      await bulkGetSuccess(client, repository, registry, objects, { namespace });

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(objects.length);
      objects.forEach((obj) => {
        expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
          action: AuditAction.GET,
          savedObject: { type: obj.type, id: obj.id },
        });
      });
    });

    test(`adds audit event per object when not successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      const objects = [obj1, obj2];
      await expect(
        bulkGetSuccess(client, repository, registry, objects, { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(objects.length);
      objects.forEach((obj) => {
        expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
          action: AuditAction.GET,
          savedObject: { type: obj.type, id: obj.id },
          error: enforceError,
        });
      });
    });
  });

  describe('#bulkCreate', () => {
    beforeEach(() => {
      mockPreflightCheckForCreate.mockReset();
      mockPreflightCheckForCreate.mockImplementation(({ objects }) => {
        // eslint-disable-next-line @typescript-eslint/no-shadow
        return Promise.resolve(objects.map(({ type, id }) => ({ type, id }))); // respond with no errors by default
      });
    });

    const obj1 = {
      type: 'config',
      id: '6.0.0-alpha1',
      attributes: { title: 'Test One' },
      references: [{ name: 'ref_0', type: 'test', id: '1' }],
    };
    const obj2 = {
      type: 'index-pattern',
      id: 'logstash-*',
      attributes: { title: 'Test Two' },
      references: [{ name: 'ref_0', type: 'test', id: '2' }],
    };

    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(bulkCreateSuccess(client, repository, [obj1, obj2])).rejects.toThrow(
        checkAuthError
      );
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`propagates decorated error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        bulkCreateSuccess(client, repository, [obj1, obj2], { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
    });

    test(`returns result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const objects = [obj1, obj2];
      const result = await bulkCreateSuccess(client, repository, objects);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(client.bulk).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        saved_objects: objects.map((obj) => expectCreateResult(obj)),
      });
    });

    test(`calls checkAuthorization with type, actions, and namespace`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      await bulkCreateSuccess(client, repository, [obj1, obj2], {
        namespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['bulk_create']);
      const expectedSpaces = new Set([namespace]);
      const expectedTypes = new Set([obj1.type, obj2.type]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls checkAuthorization with type, actions, namespace, and initial namespaces`, async () => {
      const objA = {
        ...obj1,
        type: MULTI_NAMESPACE_TYPE,
        initialNamespaces: ['ns-1', 'ns-2'],
      };
      const objB = {
        ...obj2,
        type: MULTI_NAMESPACE_TYPE,
        initialNamespaces: ['ns-3', 'ns-4'],
      };
      const optionsNamespace = 'ns-5';

      setupCheckAuthorized(mockSecurityExt);

      await bulkCreateSuccess(client, repository, [objA, objB], {
        namespace: optionsNamespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);

      const expectedActions = new Set(['bulk_create']);
      const expectedSpaces = new Set([
        optionsNamespace,
        ...objA.initialNamespaces,
        ...objB.initialNamespaces,
      ]);
      const expectedTypes = new Set([objA.type, objB.type]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls enforceAuthorization with action, type map, and auth map`, async () => {
      const objA = {
        ...obj1,
        type: MULTI_NAMESPACE_TYPE,
        initialNamespaces: ['ns-1', 'ns-2'],
      };
      const objB = {
        ...obj2,
        type: MULTI_NAMESPACE_CUSTOM_INDEX_TYPE,
        initialNamespaces: ['ns-3', 'ns-4'],
      };
      const optionsNamespace = 'ns-5';

      setupCheckAuthorized(mockSecurityExt);

      await bulkCreateSuccess(client, repository, [objA, objB], {
        namespace: optionsNamespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'bulk_create',
        })
      );
      const expectedTypesAndSpaces = new Map([
        [objA.type, new Set([optionsNamespace, ...objA.initialNamespaces])],
        [objB.type, new Set([optionsNamespace, ...objB.initialNamespaces])],
      ]);

      const { typesAndSpaces: actualTypesAndSpaces, typeMap: actualTypeMap } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
      expect(actualTypeMap).toBe(authMap);
    });

    test(`calls redactNamespaces with authorization map`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const objects = [obj1, obj2];
      await bulkCreateSuccess(client, repository, [obj1, obj2], { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);

      expect(mockSecurityExt.redactNamespaces).toHaveBeenCalledTimes(2);

      objects.forEach((obj, i) => {
        const { savedObject, typeMap } = mockSecurityExt.redactNamespaces.mock.calls[i][0];
        expect(savedObject).toEqual(
          expect.objectContaining({
            type: obj.type,
            id: obj.id,
            namespaces: [namespace],
          })
        );
        expect(typeMap).toBe(authMap);
      });
    });

    test(`adds audit event per object when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupEnforceSuccess(mockSecurityExt);

      const objects = [obj1, obj2];
      await bulkCreateSuccess(client, repository, objects, { namespace });

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(objects.length);
      objects.forEach((obj) => {
        expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
          action: AuditAction.CREATE,
          savedObject: { type: obj.type, id: obj.id },
          outcome: 'unknown',
        });
      });
    });

    test(`adds audit event per object when not successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      const objects = [obj1, obj2];
      await expect(bulkCreateSuccess(client, repository, objects, { namespace })).rejects.toThrow(
        enforceError
      );

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(objects.length);
      objects.forEach((obj) => {
        expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
          action: AuditAction.CREATE,
          savedObject: { type: obj.type, id: obj.id },
          error: enforceError,
        });
      });
    });
  });

  describe('#bulkUpdate', () => {
    const obj1: SavedObjectsBulkUpdateObject = {
      type: 'config',
      id: '6.0.0-alpha1',
      attributes: { title: 'Test One' },
    };
    const obj2: SavedObjectsBulkUpdateObject = {
      type: 'index-pattern',
      id: 'logstash-*',
      attributes: { title: 'Test Two' },
    };

    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(bulkUpdateSuccess(client, repository, registry, [obj1, obj2])).rejects.toThrow(
        checkAuthError
      );
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`propagates decorated error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(bulkUpdateSuccess(client, repository, registry, [obj1, obj2])).rejects.toThrow(
        enforceError
      );

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
    });

    test(`returns result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const objects = [obj1, obj2];
      const result = await bulkUpdateSuccess(client, repository, registry, objects);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(client.bulk).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        saved_objects: objects.map((obj) => expectUpdateResult(obj)),
      });
    });

    test(`calls checkAuthorization with type, actions, and namespace`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      await bulkUpdateSuccess(client, repository, registry, [obj1, obj2], {
        namespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['bulk_update']);
      const expectedSpaces = new Set([namespace]);
      const expectedTypes = new Set([obj1.type, obj2.type]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls checkAuthorization with type, actions, namespace, and object namespaces`, async () => {
      const objA = {
        ...obj1,
        namespace: 'ns-1', // object namespace
      };
      const objB = {
        ...obj2,
        namespace: 'ns-2', // object namespace
      };

      setupCheckAuthorized(mockSecurityExt);

      await bulkUpdateSuccess(client, repository, registry, [objA, objB], {
        namespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['bulk_update']);
      const expectedSpaces = new Set([namespace, objA.namespace, objB.namespace]);
      const expectedTypes = new Set([objA.type, objB.type]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls enforceAuthorization with action, type map, and auth map`, async () => {
      const objA = {
        ...obj1,
        namespace: 'ns-1', // object namespace
      };
      const objB = {
        ...obj2,
        namespace: 'ns-2', // object namespace
      };

      setupCheckAuthorized(mockSecurityExt);

      await bulkUpdateSuccess(client, repository, registry, [objA, objB], {
        namespace,
      });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'bulk_update',
        })
      );

      const expectedTypesAndSpaces = new Map([
        [objA.type, new Set([namespace, objA.namespace])],
        [objB.type, new Set([namespace, objB.namespace])],
      ]);

      const { typesAndSpaces: actualTypesAndSpaces, typeMap: actualTypeMap } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
      expect(actualTypeMap).toBe(authMap);
    });

    test(`calls redactNamespaces with authorization map`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const objects = [obj1, obj2];
      await bulkUpdateSuccess(client, repository, registry, objects, { namespace });

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.redactNamespaces).toHaveBeenCalledTimes(2);

      objects.forEach((obj, i) => {
        const { savedObject, typeMap } = mockSecurityExt.redactNamespaces.mock.calls[i][0];
        expect(savedObject).toEqual(
          expect.objectContaining({
            type: obj.type,
            id: obj.id,
            namespaces: [namespace],
          })
        );
        expect(typeMap).toBe(authMap);
      });
    });

    test(`adds audit event per object when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupEnforceSuccess(mockSecurityExt);

      const objects = [obj1, obj2];
      await bulkUpdateSuccess(client, repository, registry, objects, { namespace });

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(objects.length);
      objects.forEach((obj) => {
        expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
          action: AuditAction.UPDATE,
          savedObject: { type: obj.type, id: obj.id },
          outcome: 'unknown',
        });
      });
    });

    test(`adds audit event per object when not successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      const objects = [obj1, obj2];
      await expect(
        bulkUpdateSuccess(client, repository, registry, objects, { namespace })
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(objects.length);
      objects.forEach((obj) => {
        expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
          action: AuditAction.UPDATE,
          savedObject: { type: obj.type, id: obj.id },
          error: enforceError,
        });
      });
    });
  });

  describe('#bulkDelete', () => {
    beforeEach(() => {
      mockDeleteLegacyUrlAliases.mockClear();
      mockDeleteLegacyUrlAliases.mockResolvedValue();
    });

    const obj1: SavedObjectsBulkUpdateObject = {
      type: 'config',
      id: '6.0.0-alpha1',
      attributes: { title: 'Test One' },
    };
    const obj2: SavedObjectsBulkUpdateObject = {
      type: MULTI_NAMESPACE_TYPE,
      id: 'logstash-*',
      attributes: { title: 'Test Two' },
    };
    const testObjs = [obj1, obj2];
    const options = {
      namespace,
      force: true,
    };
    const internalOptions = {
      mockMGetResponseObjects: [
        {
          ...obj1,
          initialNamespaces: undefined,
        },
        {
          ...obj2,
          initialNamespaces: [namespace, 'NS-1', 'NS-2'],
        },
      ],
    };

    test(`propagates decorated error when checkAuthorization rejects promise`, async () => {
      mockSecurityExt.checkAuthorization.mockRejectedValueOnce(checkAuthError);
      await expect(
        bulkDeleteSuccess(client, repository, registry, testObjs, options)
      ).rejects.toThrow(checkAuthError);
      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).not.toHaveBeenCalled();
    });

    test(`propagates decorated error when unauthorized`, async () => {
      setupCheckUnauthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      await expect(
        bulkDeleteSuccess(client, repository, registry, testObjs, options)
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
    });

    test(`returns result when authorized`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupEnforceSuccess(mockSecurityExt);
      setupRedactPassthrough(mockSecurityExt);

      const result = await bulkDeleteSuccess(
        client,
        repository,
        registry,
        testObjs,
        options,
        internalOptions
      );

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(client.bulk).toHaveBeenCalledTimes(1);
      expect(result).toEqual({
        statuses: testObjs.map((obj) => createBulkDeleteSuccessStatus(obj)),
      });
    });

    test(`calls checkAuthorization with type, actions, and namespaces`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      await bulkDeleteSuccess(client, repository, registry, testObjs, options, internalOptions);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      const expectedActions = new Set(['bulk_delete']);
      const expectedSpaces = new Set(internalOptions.mockMGetResponseObjects[1].initialNamespaces);
      const expectedTypes = new Set([obj1.type, obj2.type]);

      const {
        actions: actualActions,
        spaces: actualSpaces,
        types: actualTypes,
      } = mockSecurityExt.checkAuthorization.mock.calls[0][0];

      expect(setsAreEqual(actualActions, expectedActions)).toBeTruthy();
      expect(setsAreEqual(actualSpaces, expectedSpaces)).toBeTruthy();
      expect(setsAreEqual(actualTypes, expectedTypes)).toBeTruthy();
    });

    test(`calls enforceAuthorization with action, type map, and auth map`, async () => {
      setupCheckAuthorized(mockSecurityExt);

      await bulkDeleteSuccess(client, repository, registry, testObjs, options, internalOptions);

      expect(mockSecurityExt.checkAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledTimes(1);
      expect(mockSecurityExt.enforceAuthorization).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'bulk_delete',
        })
      );

      const expectedTypesAndSpaces = new Map([
        [obj1.type, new Set([namespace])],
        [obj2.type, new Set([namespace])], // only need authz in current space
      ]);

      const { typesAndSpaces: actualTypesAndSpaces, typeMap: actualTypeMap } =
        mockSecurityExt.enforceAuthorization.mock.calls[0][0];

      expect(typeMapsAreEqual(actualTypesAndSpaces, expectedTypesAndSpaces)).toBeTruthy();
      expect(actualTypeMap).toBe(authMap);
    });

    test(`adds audit event per object when successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupEnforceSuccess(mockSecurityExt);

      const objects = [obj1, obj2];
      await bulkDeleteSuccess(client, repository, registry, objects, options);

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(objects.length);
      objects.forEach((obj) => {
        expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
          action: AuditAction.DELETE,
          savedObject: { type: obj.type, id: obj.id },
          outcome: 'unknown',
        });
      });
    });

    test(`adds audit event per object when not successful`, async () => {
      setupCheckAuthorized(mockSecurityExt);
      setupEnforceFailure(mockSecurityExt);

      const objects = [obj1, obj2];
      await expect(
        bulkDeleteSuccess(client, repository, registry, objects, options)
      ).rejects.toThrow(enforceError);

      expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledTimes(objects.length);
      objects.forEach((obj) => {
        expect(mockSecurityExt.addAuditEvent).toHaveBeenCalledWith({
          action: AuditAction.DELETE,
          savedObject: { type: obj.type, id: obj.id },
          error: enforceError,
        });
      });
    });
  });
});
