import * as inflect from "inflect";
import Sequelize = require("sequelize");

export interface AnyAttributes {};
export interface Association {
  accessors: {
    add?: string;
    addMultiple?: string;
    count?: string;
    create: string;
    get: string;
    hasAll?: string;
    hasSingle?: string;
    remove?: string;
    removeMultiple?: string;
    set: string;
  };
}
export interface ModelInstance extends Sequelize.Instance<AnyAttributes> {};

export interface NormalizedResponse {
  [key: string]: Object;
}

export default class RestSerializer {
  keyForRecord(instance: ModelInstance, singular: boolean) {
    const tableName = instance.Model.getTableName() as string;
    const recordKey = tableName.toLowerCase();

    if (singular) {
      return inflect.singularize(recordKey);
    }

    return inflect.pluralize(recordKey);
  }

  keyForRelationship(relationship: string) {
    return inflect.pluralize(relationship.toLowerCase());
  }

  async normalizeArrayResponse(instances: ModelInstance[]): Promise<NormalizedResponse> {
    const records = [];
    const response = {};
    let key;

    for (const instance of instances) {
      const associations = (instance.Model as any).associations;
      const json = instance.toJSON();

      await this.normalizeRelationships(instance, json, associations);

      records.push(json);

      if (!key) {
        key = this.keyForRecord(instance, false);
      }
    }

    response[key] = records;

    return response;
  }

  normalizeResponse(instance: any, method: string): Promise<NormalizedResponse> {
    switch (method) {
      case "createRecord":
      case "findOne":
      case "updateRecord":
        return this.normalizeSingularResponse(instance);
      case "findAll":
        return this.normalizeArrayResponse(instance);
    }
  }

  async normalizeSingularResponse(instance: ModelInstance): Promise<NormalizedResponse> {
    const json = instance.toJSON();
    const key = this.keyForRecord(instance, true);
    const response = {
      [key]: json
    }
    const associations = (instance.Model as any).associations;

    await this.normalizeRelationships(instance, response[key], associations);

    return response;
  }

  async getRelationships(instance: ModelInstance, payload: Object, association: Association): Promise<any> {
    const accessors = association.accessors;
    const isManyRelationship = Object.keys(accessors).some(accessor => {
      return [
        "add",
        "addMultiple",
        "count",
        "hasSingle",
        "hasAll",
        "removeMultiple"
      ].some(valid => valid === accessor);
    });

    if (isManyRelationship) {
      const relationships = await instance[association.accessors.get]();

      return relationships.map(relationship => relationship.id);
    }
  }

  async normalizeRelationships(instance: ModelInstance, payload: Object, associations: Object): Promise<any> {
    for (const association in associations) {
      const relationship = await this.getRelationships(
        instance,
        payload,
        associations[association]
      );
      const relationshipKey = this.keyForRelationship(association);

      if (relationship) {
        payload[relationshipKey] = relationship;
      }
    }

    return payload;
  }
}
