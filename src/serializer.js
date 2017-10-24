"use strict";

import inflect from "inflect";

import JSONSerializer from "@parch-js/json-serializer";

/**
 * @class RestSerializer
 * @extends <a href="https://github.com/parch-js/json-serializer" target="_blank">JSONSerializer</a>
 * @constructor
 */
export default class RestSerializer extends JSONSerializer {
  /**
   * Returns an array of ids for a give hasMany/belongsToMany relatioship
   *
   * @method getRelationships
   * @param {Object} instance Sequelize model instance
   * @param {Object} association Sequelize model instance
   * @return {Array}
   *
   * @example
   * ```javascript
   * return orm.findOne("user", 1).then(user => {
   *   return serializer.getRelationships(user, user.Model.associations.Project);
   * }).then(relationships => {
   *   /**
   *    * [1, 2, 3]
   *    *
   * });
   * ```
   */
  getRelationships(instance, association) {
    const accessors = association.accessors;
    const isManyRelationship = Object.keys(accessors).some(accessor => {
      const hasManyRelationshipAccessor = [
        "add",
        "addMultiple",
        "count",
        "hasSingle",
        "hasAll",
        "removeMultiple"
      ].some(valid => valid === accessor);

      return hasManyRelationshipAccessor;
    });

    if (isManyRelationship) {
      return instance[accessors.get]().then(relationships =>
        relationships.map(relationship => relationship.id)
      );
    } else {
      return Promise.resolve();
    }
  }

  /**
   * Returns the name string for the record
   *
   * @method keyForRecord
   * @param {Object} instance sequelize model instance
   * @param {Boolean} singular singular or plural name
   * @return {String} name string for record root
   *
   * @example
   * ```javascript
   * return orm.findOne("user", 1).then(user => {
   *   const res = {};
   *   const resKey = serializer.keyForRecord(user, true);
   *
   *   res[resKey] = user.toJSON();
   *
   *   return res;
   * });
   * ```
   */
  keyForRecord(instance, singular) {
    const tableName = instance.Model.getTableName();
    const recordKey = tableName.toLowerCase();

    if (singular) { return inflect.singularize(recordKey); }

    return inflect.pluralize(recordKey);
  }

  /**
   * Return the object key for a relationship
   *
   * @method keyForRelationship
   * @param {String} relationship the relationship name (e.g. `Projects`)
   * @return {String} name string for the relationship
   *
   * @example
   * ```javascript
   * return serializer.keyForRelationship("Projects").then(key => {
   *   // "projects"
   * });
   * ```
   */
  keyForRelationship(relationship) {
    return inflect.pluralize(relationship.toLowerCase());
  }

  /**
   * Takes an array of Sequelize instances and returns an object with a root key
   * based on the model name and an array of pojo records
   *
   * @method normalizeArrayResponse
   * @param {Array} instances Sequelize instances
   * @return {Promise}<Object, Error>
   *
   * @example
   * ```javascript
   * return orm.findAll("user").then(users => {
   *   return serializer.normalizeArrayResponse(instances);
   * }).then(response => {
   *   /**
   *    * {
   *    *   users: [{
   *    *   }]
   *    * }
   * });
   * ```
   */
  normalizeArrayResponse(instances, fallbackName) {
    let key;

    if (!instances || !instances.length) {
      key = inflect.camelize(inflect.pluralize(fallbackName), false);

      return Promise.resolve({
        [key]: []
      });
    }

    return Promise.all(instances.map(instance => {
      key = key || this.keyForRecord(instance, false);

      return this.normalizeRelationships(instance, instance);
    })).then(records => this._defineArrayResponse(key, records));
  }

  /**
   * Takes a single Sequelize instance and returns an object with a root key based
   * on the model name and a pojo record
   *
   * @method normalizeSingularResponse
   * @param {Object} instance Sequelize model instance
   * @return {Promise}<Object, Error>
   *
   * @example
   * ```javascript
   * return orm.findOne("user", 1).then(user => {
   *   return serializer.normalizeSingularResponse(instance, "findOne");
   * }).then(response => {
   *   /**
   *    * {
   *    *   user: {
   *    *   }
   *    * }
   * });
   * ```
   */
  normalizeSingularResponse(instance) {
    const key = this.keyForRecord(instance, true);

    return this.normalizeRelationships(instance, instance).then(newRecord =>
      this._defineSingularResponse(key, newRecord)
    );
  }

  /**
   * @method normalizeRelationships
   * @param {Object} instance Sequelize model instance
   * @param {Object} payload Pojo representation of Sequelize model instance
   * @return {Promis}<Object, Error>
   *
   * @example
   * ```javascript
   * return store.findOne("user", 1).then(user => {
   *   return serializer.normalizeRelationships(user, user.toJSON());
   * }).then(response => {
   *   /**
   *    * {
   *    *   user: {
   *    *     projects: [1, 2, 3]
   *    *   }
   *    * }
   * });
   * ```
   */
  normalizeRelationships(instance, payload) {
    const associations = instance.Model.associations;

    return Promise.all(Object.keys(associations).map(association =>
      this.getRelationships(instance, associations[association]).then(relationships => {
        return {
          key: this.keyForRelationship(association),
          records: relationships
        };
      })
    )).then(relationships => {
      relationships.forEach(relationship => {
        payload[relationship.key] = relationship.records;
      });

      return payload;
    });
  }

  /**
   * Reformats the record into a RESTful object with the record name as the key.
   * In addition, this will add a custom toJSON method on the response object
   * that will serialize the response when sent through something like
   * express#res.send, retaining the relationships on the instance, but removing
   * all other extraneous data (see <a href="https://github.com/sequelize/sequelize/blob/16864699e0cc4b5fbc5bbf742b7a15eea9948e77/lib/model.js#L4005" target="_bank">Sequelize instance#toJSON</a>)
   *
   * @method _defineArrayResponse
   * @private
   * @param {String} key the name of the record (e.g. users)
   * @param {Array<Object>} records Array of sequelize instances
   * @returns {Object}
   *
   * @example
   * ```javascript
   * serializer._defineArrayResponse("users", [{
   *   dataValues: {
   *     firstName: "Hank",
   *     lastName: "Hill",
   *     projects: [1, 2]
   *   },
   *   someExtraneousProp: "foo"
   * }]);
   *
   * /**
   *  * {
   *  *   users: [{
   *  *     dataValues: {
   *  *       firstName: "Hank",
   *  *       lastName: "Hill",
   *  *       projects: [1, 2],
   *  *     },
   *  *     someExtraneousProp: "foo",
   *  *     toJSON() {
   *  *     }
   *  *   }]
   *  * }
   *  *
   *  * response.toJSON()
   *  *
   *  * {
   *  *   "users": [{
   *  *     firstName: "Hank",
   *  *     lastName: "Hill",
   *  *     projects: [1, 2],
   *  *   }]
   *  * }
   * ```
   */
  _defineArrayResponse(key, records) {
    const response = {};
    const self = this;

    Object.defineProperty(response, key, {
      configurable: false,
      enumerable: true,
      value: records
    });

    Object.defineProperty(response, "toJSON", {
      configurable: false,
      enumerable: false,
      value() {
        const recordArray = this[key];
        const newRecords = recordArray.map(record => {
          const associations = record.Model.associations;
          const newRecord = {};

          Object.keys(associations).forEach(association => {
            const associationKey = self.keyForRelationship(association);

            if (record[associationKey]) {
              newRecord[associationKey] = record[associationKey];
            }
          });

          const plainInstance = record.toJSON();

          Object.keys(plainInstance).forEach(property => {
            newRecord[property] = plainInstance[property];
          });

          return newRecord;
        });

        return {
          [key]: newRecords
        };
      }
    });

    return response;
  }

  /**
   * Similar to {{#crossLink "RestSerializer/_defineArrayResponse:method"}}_defineArrayResponse{{/crossLink}},
   * the difference being that this takes a single record and returns a singular response
   *
   * @method _defineSingularResponse
   * @private
   * @param {String} key the name of the record (e.g. users)
   * @param {Object} record Sequelize instance
   * @returns {Object}
   *
   * @example
   * ```javascript
   * serializer._defineSingularResponse("user", {
   *   dataValues: {
   *     firstName: "Hank",
   *     lastName: "Hill",
   *     projects: [1, 2]
   *   },
   *   someExtraneousProp: "foo",
   * });
   *
   * /**
   *  * {
   *  *   user: {
   *  *     dataValues: {
   *  *       firstName: "Hank",
   *  *       lastName: "Hill",
   *  *       projects: [1, 2],
   *  *     someExtraneousProp: "foo",
   *  *     toJSON() {
   *  *     }
   *  *   }
   *  * }
   *  *
   *  * response.toJSON()
   *  *
   *  * {
   *  *   "user": [{
   *  *     "firstName": "Hank",
   *  *     "lastName": "Hill",
   *  *     "projects": [1, 2],
   *  *   }]
   *  * }
   * ```
   */
  _defineSingularResponse(key, record) {
    const response = {};
    const self = this;

    Object.defineProperty(response, key, {
      configurable: false,
      enumerable: true,
      value: record
    });

    Object.defineProperty(response, "toJSON", {
      configurable: false,
      enumerable: false,
      value() {
        const instance = this[key];
        const associations = instance.Model.associations;
        const newRecord = {};

        Object.keys(associations).forEach(association => {
          const associationKey = self.keyForRelationship(association);

          if (instance[associationKey]) {
            newRecord[associationKey] = instance[associationKey];
          }
        });

        const plainInstance = instance.toJSON();

        Object.keys(plainInstance).forEach(property => {
          newRecord[property] = plainInstance[property];
        });

        return {
          [key]: newRecord
        };
      }
    });

    return response;
  }
}
