"use strict";

import inflect from "inflect";

import JSONSerializer from "@parch-js/json-serializer";

/**
 * @class RestSerializer
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
    })).then(records => {
      return {
        [key]: records
      };
    });
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

    return this.normalizeRelationships(instance, instance).then(newRecord => {
      return {
        [key]: newRecord
      };
    });
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
    let relationshipKey;

    return Promise.all(Object.keys(associations).map(association => {
      if (associations.hasOwnProperty(association)) {
        relationshipKey = this.keyForRelationship(association);
        return this.getRelationships(instance, associations[association]);
      } else {
        return [];
      }
    })).then(relationships => {
      relationships.forEach(relationship => {
        if (relationship) {
          payload[relationshipKey] = relationship;
        }
      });

      return payload;
    });
  }
}
